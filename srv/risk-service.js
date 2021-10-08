/**
 * Implementation for Risk Management service defined in ./risk-service.cds
 */ 
 module.exports = async (srv) => {
    const messaging = await cds.connect.to('messaging');
    const db = await cds.connect.to('db');
    const BupaService = await cds.connect.to('API_BUSINESS_PARTNER');
    const { BusinessPartners: externalBP, BuPaIndustry} = srv.entities
    const { BusinessPartners } = db.entities('sap.ui.riskmanagement');
    const {BusinessPartner: sdkBusinessPartner}  = require('@sap/cloud-sdk-vdm-business-partner-service');
    const packageJson = require("../package.json");
   // namespace = messaging.options.credentials && messaging.options.credentials.namespace;

    srv.after('READ', 'Risks', (risksData) => {
        const risks = Array.isArray(risksData) ? risksData : [risksData];
        risks.forEach(risk => {
            if (risk.impact >= 100000) {
                risk.criticality = 1;
            } else {
                risk.criticality = 2;
            }
        });
    });

    messaging.on("sap/S4HANAOD/risM/ce/sap/s4/beh/businesspartner/v1/BusinessPartner/Changed/v1", async (msg) => {
        console.log("<< event caught", msg);
        const BUSINESSPARTNER = msg.data.BusinessPartner;
        console.log('<<< Received Business Partner ' + BUSINESSPARTNER )
        const replica = await cds.tx(msg).run(SELECT.one(BusinessPartners, (n) => n.ID).where({ID: BUSINESSPARTNER}));
        if(!replica) return;
        const bp = await BupaService.tx(msg).run(SELECT.one(externalBP).where({ID: BUSINESSPARTNER}));
        if(bp) return db.tx(msg).run(UPDATE(BusinessPartners, replica.ID).with(bp));
    });

  srv.before('SAVE', 'Risks', async req => {
    const assigned = { ID: req.data.bp_ID }
    if (!assigned.ID) return
    const local = db.transaction(req)
    const [replica] = await local.read(BusinessPartners).where(assigned)
    if (replica) return
    const [bp] = await BupaService.tx(req).run(SELECT.from(externalBP).where(assigned))
    if (bp) return local.create(BusinessPartners).entries(bp)
  });

  srv.after('SAVE', 'Risks', async (data)=>{
    if(data.impact >= 100000 && data.prio == 1){
        let payload = {
            "searchTerm1": "Very High Risk",
            "businessPartnerIsBlocked": true
          }
          let payloadBuilder = sdkBusinessPartner.builder().fromJson(payload);
          payloadBuilder.businessPartner = data.bp_ID;
          let res = await sdkBusinessPartner.requestBuilder().update(payloadBuilder).execute({
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

    messaging.on("sap/S4HANAOD/risM/ce/sap/s4/beh/businesspartner/v1/BusinessPartner/Created/v1", async (msg) => {
      console.log("<< event caught", msg);
      let BUSINESSPARTNER = msg.data.BusinessPartner;
      const industry = await BupaService.tx(msg).run(SELECT.one(BuPaIndustry).where({BusinessPartner: BUSINESSPARTNER}))
      console.log("Belongs to Industry >> ", industry);
      if(industry && industry.IndustrySector == "73"){
        const bp = await BupaService.tx(msg).run(SELECT.one(externalBP).where({ID: BUSINESSPARTNER}));
        bp.industry = industry.IndustryKeyDescription;
        await db.tx(msg).create(BusinessPartners).entries(bp);
        createRisk(BUSINESSPARTNER, msg);
      }
    });
    async function createRisk(BUSINESSPARTNER, msg){
      const payload = {
        title: 'auto: CFR non-compliance',
        descr: 'New Business Partner might violate CFR code',
        bp_ID: BUSINESSPARTNER,
        status_value: 'NEW'
      }
      console.log("Creating auto risk with", payload);
      return cds.tx(msg).run(INSERT.into(srv.entities.Risks).entries(payload));  
    }
}