namespace sap.ui.riskmanagement;
using { managed } from '@sap/cds/common';
  entity Risks : managed {
    key ID      : UUID  @(Core.Computed : true);
    title       : String(100);
    prio        : String(5);
    descr       : String;
    miti        : Association to Mitigations;
    impact      : Integer;
    bp          : Association to BusinessPartners;
    criticality : Integer;
    status      : Association to StatusValues;
  }
  entity Mitigations : managed {
    key ID       : UUID  @(Core.Computed : true);
    description  : String;
    owner        : String;
    timeline     : String;
    risks        : Association to many Risks on risks.miti = $self;
  }

  @cds.autoexpose
  entity StatusValues {
    key value:String;
    criticality: Integer;
  }

  // using an external service from
  using {  API_BUSINESS_PARTNER as external } from '../srv/external/API_BUSINESS_PARTNER.csn';

  @cds.persistence:{table,skip:false}
  @cds.autoexpose
  entity BusinessPartners as projection on external.A_BusinessPartner {
      key BusinessPartner as ID,
      BusinessPartnerFullName as businessPartnerFullName,
      BusinessPartnerIsBlocked as businessPartnerIsBlocked,
      SearchTerm1 as searchTerm1,
      Industry as industry : String(20)
  }