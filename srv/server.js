const cds = require ('@sap/cds');
cds.on('bootstrap', (app) => {
    if (cds.env.env !== "development")
        cds.mtx.in(app); // serve cds-mtx APIs (only in productive env)
});
module.exports = cds.server;