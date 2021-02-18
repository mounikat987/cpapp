using RiskService from './risk-service';

annotate RiskService.Risks with {
	title       @title: 'Title';
	prio        @title: 'Priority';
	descr       @title: 'Description';
	miti        @title: 'Mitigation';
	impact      @title: 'Impact';
    bp          @title: 'Business Partner';
}

annotate RiskService.Mitigations with {
	ID @(
		UI.Hidden,
		Common: {
		Text: description
		}
	);
	description  @title: 'Description';
	owner        @title: 'Owner';
	timeline     @title: 'Timeline';
	risks        @title: 'Risks';
}

annotate RiskService.Risks with @(
	UI: {
		HeaderInfo: {
			TypeName: 'Risk',
			TypeNamePlural: 'Risks'
		},
		SelectionFields: [prio],
		LineItem: [
			{Value: title},
			{Value: miti_ID},
			{Value: bp.businessPartnerFullName},
			{
				Value: prio,
				Criticality: criticality
			},
			{
				Value: impact,
				Criticality: criticality
			}
		],
		Facets: [
			{$Type: 'UI.ReferenceFacet', Label: 'Main', Target: '@UI.FieldGroup#Main'}
		],
		FieldGroup#Main: {
			Data: [
				{Value: title},
				{Value: miti_ID},
				{Value: descr},
				{
					Value: prio,
					Criticality: criticality
				},
                {
					Value: impact,
					Criticality: criticality
				},
				{Value: bp_ID},
                {Value : bp.businessPartnerFullName},
                {Value : bp.businessPartnerIsBlocked},
                {Value : bp.searchTerm1}
			]
		}
	},
    Common.SideEffects : {
        EffectTypes      : #ValueChange,
        SourceProperties : [bp_ID],
        TargetProperties : [
            bp.businessPartnerFullName,
            bp.businessPartnerIsBlocked,
            bp.searchTerm1
        ]
    }
) {

};

annotate RiskService.Risks with {
	miti @(
		Common: {
			//show text, not id for mitigation in the context of risks
			Text: miti.description  , TextArrangement: #TextOnly,
			ValueList: {
				Label: 'Mitigations',
				CollectionPath: 'Mitigations',
				Parameters: [
					{ $Type: 'Common.ValueListParameterInOut',
						LocalDataProperty: miti_ID,
						ValueListProperty: 'ID'
					},
					{ $Type: 'Common.ValueListParameterDisplayOnly',
						ValueListProperty: 'description'
					}
				]
			}
		},
		UI.MultiLineText: IsActiveEntity
	);
	bp @(
		Common: {
			Text: bp.ID  , TextArrangement: #TextOnly,
			ValueList: {
				Label: 'Business Partners',
				CollectionPath: 'BusinessPartners',
				Parameters: [
					{ $Type: 'Common.ValueListParameterInOut',
						LocalDataProperty: bp_ID,
						ValueListProperty: 'ID'
					},
					{ $Type: 'Common.ValueListParameterDisplayOnly',
						ValueListProperty: 'businessPartnerFullName'
					},
					{ $Type: 'Common.ValueListParameterDisplayOnly',
						ValueListProperty: 'businessPartnerIsBlocked'
					},
                    { $Type: 'Common.ValueListParameterDisplayOnly',
						ValueListProperty: 'searchTerm1'
					}
				]
			}
		}
	);
}


  annotate RiskService.BusinessPartners with {
    // ID @(
    //   UI.Hidden,
    //   Common: {
    //     Text: businessPartnerFullName
    //   }
    // );
    ID @title: 'Business Partner';
    businessPartnerFullName    @title: 'Business Partner Name' @readonly;
    businessPartnerIsBlocked   @title: 'Blocked Status' @readonly;
    searchTerm1 @title: 'Search Term' @readonly;
  }