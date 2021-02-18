/**
 * Implementation for Risk Management service defined in ./risk-service.cds
 */
module.exports = async (srv) => {
    const messaging = await cds.connect.to('messaging');
    const namespace = messaging.options.credentials && messaging.options.credentials.namespace;
    const db = await cds.connect.to('db');
    const BupaService = await cds.connect.to('API_BUSINESS_PARTNER');
    const { BusinessPartners: externalBP} = srv.entities
    const { BusinessPartners } = db.entities('sap.ui.riskmanagement');
    const {BusinessPartner: sdkBusinessPartner}  = require('@sap/cloud-sdk-vdm-business-partner-service');
    const packageJson = require("../package.json");
    srv.after('READ', 'Risks', (risks) => {

        risks.forEach((risk) => {
            if (risk.impact >= 100000) {
                risk.criticality = 1;
            } else {
                risk.criticality = 2;
            }
        });
    });
    messaging.on("refapps/cpappems/abc/BO/BusinessPartner/Changed", async (msg) => {
        console.log("<< event caught", msg);
        const BUSINESSPARTNER = (+(msg.data.KEY[0].BUSINESSPARTNER)).toString();
        const replica = await cds.tx(msg).run(SELECT.one(BusinessPartners, (n) => n.ID).where({ID: BUSINESSPARTNER}));
        if(!replica) return;
        const bp = await BupaService.tx(msg).run(SELECT.one(externalBP).where({ID: BUSINESSPARTNER}));
        const {UPDATE} = cds.ql(msg);
        if(bp) return db.tx(msg).run(UPDATE(BusinessPartners, replica.ID).with(bp));

   });

  srv.before('SAVE', 'Risks', async req => {
    const assigned = { ID: req.data.bp_ID }
    if (!assigned.ID) return
    const local = db.transaction(req)
    const [replica] = await local.read(BusinessPartners).where(assigned)
    if (replica) return
    const [bp] = await BupaService.tx(req).run(SELECT.from(externalBP).where(assigned))
    if (bp) return local.create(BusinessPartners).entries(bp);
  });
  srv.after('SAVE', 'Risks', async (data)=>{
    if(data.impact >= 100000 && data.prio == 1){
        let payload = {
            "searchTerm1": "Very High Risk",
            "businessPartnerIsBlocked": true
          }
          let payloadBuilder = sdkBusinessPartner.builder().fromJson(payload);
          payloadBuilder.businessPartner = data.bp_ID;
          let res = await sdkBusinessPartner.requestBuilder().update(payloadBuilder).withCustomServicePath("/").execute({
            destinationName: packageJson.cds.requires.API_BUSINESS_PARTNER.credentials.destination
          });
          console.log("Search Term update", res);
    }
  });
    // srv.on('READ', 'Risks', (req, next) => {
    //     req.query.SELECT.columns = req.query.SELECT.columns.filter(({ expand, ref }) => !(expand && ref[0] === 'bp'));
    //     return next();
    // });

    srv.on('READ', 'BusinessPartners', async (req) => {
        console.log(req.query);
        let res = await BupaService.tx(req).run(req.query)
        console.log(`retrieved ${res.length} records`);
        return res
    });
};