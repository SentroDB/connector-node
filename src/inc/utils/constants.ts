import DBManagerTypes from "@sentrodb/connector-node-types";

export const EMPTY_SCHEMA_DETAILS: DBManagerTypes.SchemaDetails = {
    tables: [],
}

export const ADMIN_DIR_NAME = ".admin";
export const CUSTOMIZATIONS_FILE_NAME = `${ADMIN_DIR_NAME}/dbmanager-customizations.json`;
export const VIEWS_DIR_NAME = `${ADMIN_DIR_NAME}/views`;
export const APPROVALS_FILE_NAME = `${ADMIN_DIR_NAME}/approvals.json`;

export const EMPTY_TABLE_CUSTOMIZATION: DBManagerTypes.CustomTable = {
    rename: "",
    icon: "",
    allowCreate: true,
    allowEdit: true,
    allowDelete: true,
    isVisible: true,
    allowExport: true,
    displayFields: [],
    tableActions: [],
    recordActions: [],
    segments: [],
};

export const EMPTY_COLUMN_CUSTOMIZATION: DBManagerTypes.CustomColumn = {
    description: "",
    rename: "",
    hideView: false,
    hideEdit: false,
    hideCreate: false,
    readOnly: false,
    position: 0,
    displayType: "",
    editType: "",
    displayPrefix: "",
    displaySuffix: "",
    preferredColumnsToDisplay: [],
};
