/**
 * Implementation for Risk Management service defined in ./risk-service.cds
 */
module.exports = async (srv) => {
    srv.after('READ', 'Risks', (risks) => {

        risks.forEach((risk) => {
            if (risk.impact >= 100000) {
                risk.criticality = 1;
            } else {
                risk.criticality = 2;
            }
        });
    });
   srv.on('READ', 'Risks', async (req, next) => {
        const expandIndex = req.query.SELECT.columns.findIndex(({ expand, ref }) => expand && ref[0] === 'bp');
        if (expandIndex < 0) return next();
        req.query.SELECT.columns.splice(expandIndex, 1);
        if (!req.query.SELECT.columns.find( column => column.ref.find( ref => ref == "bp_BusinessPartner" ))) req.query.SELECT.columns.push({ ref: ["bp_BusinessPartner"] });
        const res = await next();
        await Promise.all( res.map( async risk => {
            // Workaround for CAP issue
            const mock = !cds.env.requires.API_BUSINESS_PARTNER.credentials;
            const tx = mock ? BupaService.tx(req) : BupaService;
            const bp = await tx.run(SELECT.one(srv.entities.BusinessPartners).where({ BusinessPartner: risk.bp_BusinessPartner }).columns([ "BusinessPartner", "BusinessPartnerFullName", "BusinessPartnerIsBlocked" ]));
            risk.bp = bp;
        }));
        return res;
    });
    const BupaService = await cds.connect.to('API_BUSINESS_PARTNER');
    srv.on('READ', srv.entities.BusinessPartners, async (req) => {
        // Workaround for CAP issue
        const mock = !cds.env.requires.API_BUSINESS_PARTNER.credentials;
        const tx = mock ? BupaService.tx(req) : BupaService;
        return await tx.run(req.query);
    });
}