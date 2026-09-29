import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deleteRecordsByPrimaryKey } from "../src/inc/services/record-deleter";
import {
  assertKnownColumns,
  assertValidConditions,
  assertValidWhere,
  buildPrimaryKeyWheres,
  MAX_DELETE_RECORDS,
  RequestValidationError,
} from "../src/inc/utils/write-guards";

const users = {
  name: "users",
  columns: [
    { name: "id", primary_key: true },
    { name: "email" },
    { name: "status" },
    { name: "tags", isMany: true },
  ],
};

const memberships = {
  name: "memberships",
  columns: [
    { name: "userId", primary_key: true },
    { name: "orgId", primary_key: true },
    { name: "role" },
  ],
};

const logs = {
  name: "logs",
  columns: [{ name: "message" }, { name: "level" }],
};

const fakeDb = () => {
  const calls: Array<{ table: string; where: Record<string, unknown[]>; single: boolean }> = [];
  return {
    calls,
    db: {
      delete: async (args: any) => {
        calls.push(args);
        return [];
      },
    },
  };
};

describe("buildPrimaryKeyWheres", () => {
  it("uses only the primary key of a full record", () => {
    assert.deepEqual(
      buildPrimaryKeyWheres(users, [{ id: 7, email: "a@b.c", status: "active" }]),
      [{ id: 7 }],
    );
  });

  it("refuses a record without its primary key instead of matching other fields", () => {
    assert.throws(
      () => buildPrimaryKeyWheres(users, [{ status: "active" }]),
      (e: unknown) =>
        e instanceof RequestValidationError && /primary key column "id"/.test(e.message),
    );
  });

  it("refuses null, empty and object primary key values", () => {
    for (const id of [null, undefined, "", {}, [1], Number.NaN]) {
      assert.throws(
        () => buildPrimaryKeyWheres(users, [{ id, status: "active" }]),
        RequestValidationError,
      );
    }
  });

  it("refuses tables without a primary key", () => {
    assert.throws(
      () => buildPrimaryKeyWheres(logs, [{ message: "x", level: "info" }]),
      (e: unknown) =>
        e instanceof RequestValidationError && /no primary key/.test(e.message),
    );
  });

  it("requires the complete composite key", () => {
    assert.throws(
      () => buildPrimaryKeyWheres(memberships, [{ userId: "u1" }]),
      (e: unknown) =>
        e instanceof RequestValidationError && /"orgId"/.test(e.message),
    );
    assert.deepEqual(
      buildPrimaryKeyWheres(memberships, [{ userId: "u1", orgId: "o1", role: "x" }]),
      [{ userId: "u1", orgId: "o1" }],
    );
  });

  it("rejects the whole batch when one record is unkeyed", () => {
    assert.throws(
      () => buildPrimaryKeyWheres(users, [{ id: 1 }, { email: "a@b.c" }]),
      RequestValidationError,
    );
  });

  it("rejects empty, non-array and oversized bodies", () => {
    assert.throws(() => buildPrimaryKeyWheres(users, []), RequestValidationError);
    assert.throws(() => buildPrimaryKeyWheres(users, { id: 1 }), RequestValidationError);
    assert.throws(
      () =>
        buildPrimaryKeyWheres(
          users,
          Array.from({ length: MAX_DELETE_RECORDS + 1 }, (_, i) => ({ id: i + 1 })),
        ),
      RequestValidationError,
    );
  });

  it("de-duplicates repeated keys", () => {
    assert.deepEqual(buildPrimaryKeyWheres(users, [{ id: 1 }, { id: 1 }]), [{ id: 1 }]);
  });
});

describe("deleteRecordsByPrimaryKey", () => {
  it("issues one single-row statement per record", async () => {
    const { db, calls } = fakeDb();
    const count = await deleteRecordsByPrimaryKey(db as any, users, [
      { id: 1, status: "active" },
      { id: 2, status: "active" },
    ]);
    assert.equal(count, 2);
    assert.deepEqual(
      calls.map((c) => c.where),
      [{ id: [1] }, { id: [2] }],
    );
  });

  it("never builds a cross product for composite keys", async () => {
    const { db, calls } = fakeDb();
    await deleteRecordsByPrimaryKey(db as any, memberships, [
      { userId: "u1", orgId: "o1" },
      { userId: "u2", orgId: "o2" },
    ]);
    assert.deepEqual(
      calls.map((c) => c.where),
      [
        { userId: ["u1"], orgId: ["o1"] },
        { userId: ["u2"], orgId: ["o2"] },
      ],
    );
  });

  it("does not touch the database when any record is invalid", async () => {
    const { db, calls } = fakeDb();
    await assert.rejects(
      deleteRecordsByPrimaryKey(db as any, users, [{ id: 1 }, { status: "active" }]),
      RequestValidationError,
    );
    await assert.rejects(
      deleteRecordsByPrimaryKey(db as any, logs, [{ level: "info" }]),
      RequestValidationError,
    );
    assert.equal(calls.length, 0);
  });
});

describe("column validation", () => {
  it("rejects unknown columns", () => {
    assert.throws(
      () => assertKnownColumns(users, ["email", "nope"], "insert payload"),
      (e: unknown) =>
        e instanceof RequestValidationError && /Unknown column "nope"/.test(e.message),
    );
    assert.doesNotThrow(() => assertKnownColumns(users, ["email", "tags"], "insert payload"));
  });

  it("rejects identifiers that try to smuggle SQL", () => {
    assert.throws(
      () => assertKnownColumns(users, ['id"; DROP TABLE users; --'], "columns"),
      RequestValidationError,
    );
  });

  it("validates where clauses", () => {
    assert.doesNotThrow(() => assertValidWhere(users, { id: 1 }, "update", { required: true }));
    assert.doesNotThrow(() => assertValidWhere(users, undefined, "read", { required: false }));
    assert.throws(() => assertValidWhere(users, {}, "update", { required: true }), RequestValidationError);
    assert.throws(() => assertValidWhere(users, undefined, "update", { required: true }), RequestValidationError);
    assert.throws(() => assertValidWhere(users, { nope: 1 }, "update", { required: true }), RequestValidationError);
    assert.throws(() => assertValidWhere(users, { tags: 1 }, "update", { required: true }), RequestValidationError);
    assert.throws(() => assertValidWhere(users, { id: { gt: 0 } }, "update", { required: true }), RequestValidationError);
    assert.throws(() => assertValidWhere(users, [1], "update", { required: true }), RequestValidationError);
  });

  it("validates condition columns", () => {
    assert.doesNotThrow(() =>
      assertValidConditions(users, [{ column: "email", operator: "contains", value: "a" }]),
    );
    assert.throws(
      () => assertValidConditions(users, [{ column: "nope", operator: "eq", value: 1 }]),
      RequestValidationError,
    );
    assert.throws(() => assertValidConditions(users, "email = 1"), RequestValidationError);
  });
});
