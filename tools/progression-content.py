"""Authored research applications; names describe practices rather than numbered filler."""

# Subject | application | institution | explanation | yield | icon motif
SUBJECTS = """
AGRICULTURE|Seed Selection|Crop Rotation|Reserve healthy seed and alternate cultivated ground to sustain harvests.|FOOD|grain
POTTERY|Kiln Draughts|Glazed Vessels|Control the fire and seal porous vessels to keep stores fit for transport.|PRODUCTION|kiln
ANIMAL_HUSBANDRY|Fodder Storage|Selective Breeding|Keep winter fodder and breed sound working animals for reliable rural labour.|FOOD|grain
SAILING|Lashed Hulls|Coastal Pilotage|Bind hull timbers securely and learn the landmarks of sheltered coastal passages.|GOLD|sail
WRITING|Scribal Training|Archive Catalogues|Teach a consistent script and arrange records so that knowledge can be recovered.|SCIENCE|book
IRRIGATION|Sluice Gates|Canal Surveying|Measure gradients and regulate channels rather than surrender crops to uneven floods.|FOOD|water
MASONRY|Dressed Stone|Mortar Bonding|Fit quarried blocks and bind their joints to raise enduring public structures.|PRODUCTION|arch
CURRENCY|Assayed Coinage|Market Measures|Verify the metal in coins and the measures used in exchange to reduce uncertainty.|GOLD|coin
BRONZE_WORKING|Alloy Proportions|Annealing Furnaces|Balance copper and tin, then work heat-treated metal into dependable equipment.|PRODUCTION|kiln
WHEEL|Spoked Wheels|Axle Workshops|Reduce the mass of wheels and maintain their bearings to carry loads farther.|PRODUCTION|wheel
NAVIGATION|Sounding Lines|Celestial Bearings|Read water depth and the night sky to guide ships beyond familiar harbours.|GOLD|compass
ENGINEERING|Load-bearing Arches|Water Lifting|Distribute structural loads and lift water with mechanical devices.|PRODUCTION|arch
MILITARY_TRAINING|Formation Drills|Supply Depots|Practise coordinated manoeuvres and provide stores before an army takes the field.|PRODUCTION|shield
MATHEMATICS|Geometric Proofs|Survey Tables|Test relationships between magnitudes and record calculations useful to surveyors.|SCIENCE|compass
IRON_WORKING|Bloomery Control|Tempered Edges|Control reduction in the furnace and harden the edges of tools without making them brittle.|PRODUCTION|kiln
FUTURE_TECH|Experimental Workshops|Technical Compendia|Gather unresolved practical problems and preserve the results of deliberate experiments.|SCIENCE|book
CHIEFDOM|Council Witnesses|Communal Stores|Have trusted witnesses hear obligations and maintain reserves for collective needs.|HAPPINESS|council
MYSTICISM|Ritual Calendars|Sacred Custodians|Coordinate seasonal observances and entrust sacred places to recognised custodians.|HAPPINESS|sun
DISCIPLINE|Watch Rotations|Service Muster|Record watches and assemble those owing service without abandoning the harvest.|PRODUCTION|shield
PUBLIC_LIFE|Assembly Spaces|Public Messengers|Provide places to deliberate and messengers to carry decisions beyond the gathering.|CULTURE|council
CODE_OF_LAWS|Oath Records|Witness Courts|Record sworn agreements and hear competing witnesses before judgement.|HAPPINESS|scales
TACTICS|Signal Standards|Scouting Screens|Relay battlefield orders and screen formations against unseen approaches.|PRODUCTION|shield
ENTERTAINMENT|Festival Stages|Performers' Houses|Prepare communal performances and sustain the artisans who make them possible.|CULTURE|sun
CITIZENSHIP|Civic Registers|Public Duties|Record membership in the community and make obligations legible to its citizens.|HAPPINESS|book
ORG_MILITARY|Quartermasters|Campaign Accounts|Assign the distribution of supplies and account for what campaigning consumes.|PRODUCTION|shield
LITERACY|Copying Schools|Public Reading|Train readers and circulate copied works beyond the small circle of officials.|SCIENCE|book
SKILLED_TRADES|Apprentice Bonds|Workshop Standards|Teach difficult crafts through supervised work and agree standards of workmanship.|PRODUCTION|wheel
PHILOSOPHY|Schools of Debate|Ethical Commentaries|Test arguments in open discussion and examine the duties of rulers and neighbours.|CULTURE|book
COMMERCE|Caravan Contracts|Merchant Arbitration|Define responsibilities along a trading journey and settle disputes without violence.|GOLD|coin
FUTURE_CIVIC|Institutional Review|Public Remembrance|Review the community's institutions and preserve experience for those who will inherit them.|CULTURE|council
CARTOGRAPHY|Plane-table Surveys|Chart Engraving|Combine measured bearings into charts and reproduce them for travellers.|SCIENCE|compass
ASTRONOMY|Instrument Calibration|Ephemeris Tables|Calibrate observations and compare positions across successive nights.|SCIENCE|sun
MACHINERY|Camshaft Mills|Mechanical Linkages|Turn rotary power into repeated tasks through cams and carefully fitted linkages.|PRODUCTION|wheel
GUILDS|Journeyman Trials|Guild Toolhouses|Test acquired skills and keep specialised equipment within organised crafts.|PRODUCTION|wheel
FEUDALISM|Estate Surveys|Manorial Accounts|Survey dependent holdings and record the labour and produce owed by each estate.|FOOD|grain
HERALDRY|Heralds' Rolls|Mounted Retinues|Identify households in formal rolls and organise the mounted followers they support.|PRODUCTION|shield
CASTLES|Gatehouse Design|Fortress Stores|Concentrate defence at controlled entrances and provision enclosed strongholds.|PRODUCTION|arch
EDUCATION|Scholastic Lectures|Manuscript Exchange|Compare arguments in organised teaching and exchange manuscripts between schools.|SCIENCE|book
SHIPBUILDING|Watertight Compartments|Rigging Lofts|Improve hull integrity and prepare the cordage on which long voyages depend.|PRODUCTION|sail
METALLURGY|Water-powered Hammers|Ore Sorting|Apply water power to heavy work and separate promising ore before smelting.|PRODUCTION|kiln
ARCHITECTURE|Measured Elevations|Master Builders|Plan buildings to scale and coordinate the skilled crews who realise the design.|CULTURE|arch
METAL_CASTING|Pattern Moulds|Foundry Inspection|Prepare reusable patterns and inspect castings before committing them to service.|PRODUCTION|kiln
URBAN_PLANNING|Street Drainage|Municipal Surveyors|Carry waste water away from crowded streets and survey space for urban growth.|HAPPINESS|water
GUNPOWDER|Powder Graining|Ordnance Testing|Make propellant burn consistently and test weapons before field deployment.|PRODUCTION|shield
ECONOMICS|Bills of Exchange|Commercial Accounts|Transfer obligations on paper and compare the costs of distant ventures.|GOLD|coin
PIETY|Hospice Endowments|Pilgrim Registers|Endow hospitality along sacred journeys and record those entrusted to its care.|HAPPINESS|sun
MERCANTILISM|Bonded Warehouses|Customs Schedules|Hold goods under supervision and make customs charges predictable.|GOLD|coin
AUTHORITY|Sealed Warrants|Circuit Officials|Authenticate orders and send officials to hear matters outside the court.|HAPPINESS|scales
INSPIRATION|Patronage Workshops|Printed Anthologies|Support artists' work and circulate selections beyond individual patrons.|CULTURE|book
COLONIALISM|Overseas Provisioning|Maritime Jurisdictions|Examine the stores and legal claims required by distant settlements, including their burdens.|GOLD|sail
BUREAUCRACY|Office Registers|Document Chanceries|Assign responsibility to named offices and preserve authenticated decisions.|SCIENCE|book
DIPLOMATIC_SERVICE|Resident Envoys|Treaty Archives|Maintain envoys abroad and consult past agreements before making new commitments.|CULTURE|scales
SOCIETY|Mutual Aid Houses|Urban Associations|Organise assistance among neighbours and give associations recognised meeting places.|HAPPINESS|council
IMPERIALISM|Provincial Audits|Frontier Commissions|Inspect provincial accounts and examine disputed authority at the frontier.|GOLD|scales
SOVEREIGNTY|Constitutional Charters|Jurisdiction Courts|Define the reach of political authority and hear disputes over its limits.|HAPPINESS|scales
SOCIAL_CLASS|Household Surveys|Poor Relief Boards|Study differences in livelihood and organise relief rather than leaving need unrecorded.|FOOD|council
THEOLOGY|Textual Concordances|Teaching Chapters|Compare interpretations and prepare learned instruction within religious institutions.|CULTURE|book
REFORMATION|Vernacular Tracts|Confessional Schools|Publish religious argument in local languages and reorganise instruction around it.|SCIENCE|book
ACADEMICS|Peer Correspondence|Research Seminars|Exchange findings with other scholars and submit methods to organised scrutiny.|SCIENCE|book
STEAM_ENGINE|Pressure Gauges|Condensing Engines|Measure steam pressure and recover heat to make mechanical power dependable.|PRODUCTION|wheel
MILITARY_SCIENCE|Staff Mapping|Field Logistics|Join operational maps to practical calculations of transport and supply.|PRODUCTION|shield
ELECTRICITY|Insulated Circuits|Power Distribution|Isolate conductors safely and distribute electrical power to useful loads.|PRODUCTION|circuit
URBANIZATION|Sanitary Networks|Housing Surveys|Bring sanitation to dense neighbourhoods and measure the conditions of urban households.|HAPPINESS|water
COMBUSTION|Fuel Injection|Engine Workshops|Meter fuel into engines and maintain the precision parts on which they depend.|PRODUCTION|wheel
INDUSTRIALIZATION|Machine Tooling|Factory Inspection|Cut interchangeable components and inspect the workplaces that produce them.|PRODUCTION|wheel
RADIO|Tuned Receivers|Broadcast Networks|Select signals by frequency and connect listeners through scheduled transmission.|CULTURE|signal
FLIGHT|Control Surfaces|Air Navigation|Steer aircraft through movable surfaces and establish bearings beyond ground landmarks.|SCIENCE|wing
MASS_PRODUCTION|Interchangeable Gauges|Assembly Scheduling|Check parts against common gauges and coordinate their arrival at the assembly line.|PRODUCTION|wheel
COMPUTATION|Boolean Circuits|Stored Programs|Represent logical operations in circuits and store instructions alongside data.|SCIENCE|circuit
MOBILIZATION|Transport Timetables|Reserve Registries|Coordinate mass transport and maintain accurate records of trained reserves.|PRODUCTION|shield
ARMOR|Sloped Plating|Tracked Suspensions|Deflect impacts through angled armour and spread vehicle weight over tracks.|PRODUCTION|shield
AERODYNAMICS|Wind-tunnel Testing|Streamlined Airframes|Measure airflow around models and shape structures to reduce drag.|SCIENCE|wing
ROCKETRY|Guidance Gyroscopes|Staged Propulsion|Stabilise a rocket's course and separate spent stages to carry useful payloads farther.|SCIENCE|rocket
NUCLEAR_FISSION|Neutron Measurement|Reactor Control|Measure neutron behaviour and control a chain reaction within engineered safeguards.|SCIENCE|atom
MODERNIZATION|Professional Services|Civil Statistics|Train public professionals and use comparable statistics to examine national needs.|SCIENCE|council
NATURAL_HISTORY|Field Collections|Comparative Catalogues|Record organisms in their habitats and compare specimens without losing their provenance.|SCIENCE|grain
SOCIAL_QUESTION|Labour Surveys|Public Health Boards|Investigate working conditions and coordinate measures against preventable disease.|HAPPINESS|council
POLITICAL_THEORY|Constitutional Debate|Electoral Registers|Compare systems of authority and record the people permitted to participate in them.|CULTURE|scales
GLOBALISM|International Standards|Multilateral Conferences|Make cross-border systems compatible and negotiate obligations between many states.|GOLD|compass
NATIONALISM|Public Archives|Civic Commemorations|Collect records of collective experience and examine how public memory shapes belonging.|CULTURE|book
CAPITALISM|Company Accounts|Competition Inquiries|Disclose commercial performance and investigate concentrations of economic power.|GOLD|coin
MILITARISM|Civil Defence Planning|Procurement Boards|Plan protection for civilians and subject military purchases to accountable review.|PRODUCTION|shield
HEGEMONY|International Arbitration|Reconstruction Agencies|Resolve disputes through agreed procedure and coordinate recovery after destruction.|HAPPINESS|scales
DEMOCRACY|Secret Ballots|Parliamentary Committees|Protect individual votes and examine legislation through representative committees.|HAPPINESS|council
LIBERALISM|Independent Courts|Civil Liberties Registers|Test executive action before courts and document protections for the individual.|CULTURE|scales
PROGRESSIVISM|Municipal Reform|Public Service Audits|Improve local services and expose failures through transparent examination.|SCIENCE|council
FASCISM|Authoritarian Institutions|Censorship Studies|Study concentrated authority and the suppression of information without endorsing either.|CULTURE|book
RADICALISM|Political Pamphlets|Organising Networks|Trace how demands for fundamental change circulate through print and association.|CULTURE|book
AUTHORITARIANISM|Administrative Centralisation|Institutional Oversight|Examine centralised administration and the safeguards needed against unchecked power.|HAPPINESS|scales
COMMUNISM|Collective Accounts|Economic Planning|Record shared production and examine the information required by planned allocation.|PRODUCTION|wheel
CENTRALISM|Planning Bureaux|Regional Statistics|Compare local needs with central plans through consistent regional records.|SCIENCE|book
SOCIALISM|Cooperative Charters|Social Insurance|Define cooperatives' obligations and share the risks of sickness and interrupted employment.|HAPPINESS|council
FOUNDATION|Settlement Covenants|Ancestral Records|Record the duties of a founding community and preserve accounts of its beginnings.|CULTURE|council
HIERARCHY|Delegated Offices|Provincial Correspondence|Assign responsibilities beyond the ruler's household and maintain communication between offices.|GOLD|book
ADMINISTRATION|Civil Service Training|Administrative Review|Prepare officials for public duties and regularly examine the work of their departments.|SCIENCE|book
SYNCRETISM_CHOICE|Shared Observances|Comparative Traditions|Study how communities exchange practices while retaining distinct histories and beliefs.|CULTURE|sun
""".strip()

SUBJECTS = {parts[0]: dict(zip(("first", "second", "history", "yield", "motif"), parts[1:]))
            for line in SUBJECTS.splitlines() for parts in [line.split("|")]}

for subject, histories in {
    "CURRENCY": ("Assay precious metal so that the value stamped on a coin can be trusted.",
                 "Agree consistent weights and measures so that buyers and sellers can compare their bargains."),
    "PUBLIC_LIFE": ("Set aside assembly spaces where public decisions can be heard and contested.",
                    "Entrust messengers with carrying the assembly's decisions to communities beyond the gathering."),
    "MACHINERY": ("Use cams to turn a mill's rotary power into the repeated stroke of a tool.",
                  "Fit mechanical linkages to carry controlled motion between the working parts of a machine."),
    "FASCISM": ("Examine how authoritarian institutions concentrate power and weaken public accountability.",
                "Study the suppression of information and its effects on public knowledge, without endorsing censorship."),
    "SYNCRETISM_CHOICE": ("Study the shared observances through which neighbouring communities exchange practices.",
                          "Compare traditions without erasing the distinct histories and beliefs of their custodians."),
}.items():
    SUBJECTS[subject]["histories"] = histories

DOMAINS = {
    "FOOD": ("Seed Stewardship", "Harvest Agreements",
             "Rural knowledge joins seasonal labour to the careful custody of food.", "grain"),
    "PRODUCTION": ("Craft Apprenticeships", "Works Councils",
                   "Skilled labour is taught through practice and organised around maintained equipment.", "wheel"),
    "GOLD": ("Merchant Ledgers", "Exchange Arbitration",
             "Recorded obligations and trusted mediation make exchange less precarious.", "coin"),
    "SCIENCE": ("Scholarly Correspondence", "Observation Archives",
                "Evidence becomes useful when observations can be compared and recovered.", "book"),
    "CULTURE": ("Recitation Houses", "Patronage Assemblies",
                "Artists and custodians keep inherited knowledge alive through performance and discussion.", "sun"),
    "HAPPINESS": ("Community Compacts", "Mediation Councils",
                  "Agreed duties and accessible mediation sustain trust within a settlement.", "council"),
}

# Locally rooted institutions supply the context of civilization-specific applications.
CONTEXTS = {
    "AKSUM": ("Red Sea Port Registers", "Highland Assembly Witnesses", "Red Sea commerce and highland public life"),
    "EGYPT": ("Nile Survey Houses", "Temple Record Rooms", "Nile cultivation and the custody of temple records"),
    "GREECE": ("Agora Witnesses", "Polis Debate Schools", "the assemblies and public spaces of the polis"),
    "HAN": ("Commandery Registers", "Classical Study Halls", "commandery administration and classical learning"),
    "KHMER": ("Reservoir Custodians", "Temple Service Rolls", "water management and the organisation of temple labour"),
    "MAURYA": ("Provincial Inspectors", "Royal Road Stations", "provincial oversight and communication along royal roads"),
    "MAYA": ("Calendar Keepers", "Plaza Councils", "calendrical learning and the public life of plazas"),
    "MISSISSIPPIAN": ("Mound Stewardship", "River Exchange Councils", "earthwork centres and exchange along river corridors"),
    "PERSIA": ("Satrapal Correspondence", "Royal Relay Houses", "provincial government and long-distance royal communication"),
    "ROME": ("Municipal Tablets", "Public Works Colleges", "municipal record keeping and organised public construction"),
    "ROMAN": ("Municipal Tablets", "Public Works Colleges", "the inheritance of municipal law and public construction"),
    "ABBASID": ("Translation Circles", "Market Inspectors", "learned translation and the regulation of urban exchange"),
    "CHOLA": ("Temple Accountants", "Maritime Merchant Houses", "temple endowments and trading connections across the Indian Ocean"),
    "HAWAII": ("Land Division Stewards", "Voyaging Councils", "land divisions joining uplands to the sea and the knowledge of voyaging"),
    "INCA": ("Quipu Accountants", "Road Storehouses", "recorded obligations and stores along the Andean road system"),
    "INCAN": ("Quipu Accountants", "Road Storehouses", "the Andean inheritance of record keeping and road provisioning"),
    "MAJAPAHIT": ("Harbour Scribes", "Court Performance Houses", "island harbour networks and courtly performance"),
    "MING": ("Examination Registers", "Porcelain Inspectors", "scholarly examinations and the inspection of specialised production"),
    "MONGOLIA": ("Relay Station Stewards", "Pasture Agreements", "mobile pastoral life and communication through relay stations"),
    "NORMAN": ("Estate Inquests", "Castle Household Rolls", "land surveys and the organisation of fortified households"),
    "SONGHAI": ("River Toll Registers", "Scholars' Endowments", "Niger commerce and the endowment of scholarly communities"),
    "SPAIN": ("Municipal Charters", "Maritime Contract Houses", "chartered municipalities and the administration of maritime exchange"),
    "AMERICA": ("Town Meeting Minutes", "Land-grant Colleges", "representative local meetings and practical public education"),
    "AMERICAN": ("Town Meeting Minutes", "Land-grant Colleges", "the development of local representation and practical education"),
    "BUGANDA": ("County Council Records", "Banana Garden Stewardship", "county administration and the cultivation of banana gardens"),
    "FRENCH_EMPIRE": ("Prefectural Reports", "Technical Lyceums", "prefectural administration and state technical education"),
    "MEIJI": ("Technical School Boards", "Prefectural Statistics", "technical instruction and the collection of regional statistics"),
    "MEXICO": ("Municipal Ejido Records", "Civic School Boards", "communal land records and public instruction"),
    "MUGHAL": ("Revenue Survey Offices", "Imperial Atelier Rolls", "measured revenue administration and the organisation of court ateliers"),
    "PRUSSIA": ("Professional Staff Colleges", "Municipal School Inspectors", "professional training and supervised public education"),
    "QING": ("Provincial Gazetteers", "Granary Account Offices", "provincial compilations and the management of grain reserves"),
    "RUSSIA": ("Zemstvo Surveys", "Technical Institute Councils", "regional surveys and technical education"),
    "SIAM": ("Provincial Reform Boards", "Canal Administration", "regional administrative reform and canal-connected settlements"),
    "ASSYRIA": ("Palace Archive Clerks", "Canal Works Overseers", "palace archives and the supervision of large waterworks"),
    "BABYLON": ("Astronomical Diaries", "Contract Witness Houses", "systematic observation and witnessed written contracts"),
    "CARTHAGE": ("Harbour Contract Tablets", "Agronomic Instruction", "maritime contracting and practical agricultural learning"),
    "GAUL": ("Craft Assembly Houses", "River Fair Stewards", "specialised crafts and exchange at river-connected fairs"),
    "HEIAN": ("Court Diary Custody", "Estate Correspondence", "court diaries and correspondence concerning landed estates"),
    "SILLA": ("Monastic Study Houses", "Capital Workshop Records", "monastic learning and specialised work in the royal capital"),
    "TONGA": ("Voyaging Lineages", "Landing-place Custodians", "ocean navigation and the stewardship of island landing places"),
    "BULGARIA": ("Literary School Scribes", "Mountain Market Courts", "written scholarship and market exchange across mountain routes"),
    "DAI_VIET": ("Village Compact Registers", "Dike Steward Councils", "village obligations and the shared upkeep of dikes"),
    "ENGLAND": ("Borough Charters", "Wool Exchange Registers", "chartered boroughs and the organisation of the wool trade"),
    "GORYEO": ("Printing Workshop Rolls", "Monastic Archive Rooms", "the preparation of printed works and monastic record custody"),
    "ICELAND": ("Thing Witness Lists", "Farmstead Agreements", "assembly procedure and agreements among dispersed farmsteads"),
    "PIRATE_REPUBLIC": ("Crew Articles", "Harbour Arbitration", "written crew agreements and disputes in maritime communities"),
    "SENGOKU": ("Castle-town Registers", "Domain Craft Councils", "castle-town administration and specialised work within domains"),
    "SHAWNEE": ("River Council Witnesses", "Seasonal Exchange Gatherings", "river-connected communities and seasonal exchange"),
    "GREAT_BRITAIN": ("Industrial Survey Boards", "Maritime Insurance Offices", "industrial statistics and the management of maritime risk"),
    "JOSEON": ("County Gazetteers", "Scholarly Academy Rolls", "regional compilations and organised scholarly instruction"),
    "NEPAL": ("Valley Craft Assemblies", "Mountain Route Custodians", "valley crafts and the maintenance of mountain trading routes"),
    "OTTOMANS": ("Provincial Register Offices", "Endowment Inspectors", "provincial registers and the oversight of charitable endowments"),
    "QAJAR": ("Bazaar Arbitration Houses", "Provincial Correspondence", "bazaar mediation and communication between provincial centres"),
}

BUILDINGS = {
    "antiquity": [
        ("SEED_HOUSE", "Seed House", "GRANARY", "AGRICULTURE", 1, {"FOOD": 2, "SCIENCE": 1},
         "Stored samples and careful selection preserve the next harvest rather than merely the last."),
        ("POTTERS_COURT", "Potters' Court", "BRICKYARD", "POTTERY", 2, {"PRODUCTION": 2, "GOLD": 1},
         "Shared firing space gives potters a reliable place to prepare vessels for household and market."),
        ("SCRIBAL_HOUSE", "Scribal House", "LIBRARY", "WRITING", 1, {"SCIENCE": 2, "CULTURE": 1},
         "Readers, copyists and record keepers work together to make written knowledge recoverable."),
        ("SURVEYORS_LODGE", "Surveyors' Lodge", "GARDEN", "IRRIGATION", 2, {"FOOD": 2, "PRODUCTION": 1},
         "Measured boundaries and gradients guide the distribution of water and cultivated ground."),
        ("ASSAY_HOUSE", "Assay House", "MARKET", "CURRENCY", 1, {"GOLD": 2, "SCIENCE": 1},
         "Weights, samples and repeated tests allow merchants to judge precious metal consistently."),
        ("MECHANICS_YARD", "Mechanics' Yard", "BLACKSMITH", "ENGINEERING", 2, {"PRODUCTION": 2, "SCIENCE": 1},
         "Builders prepare lifting devices and structural fittings before taking them to the work site."),
    ],
    "exploration": [
        ("CHART_HOUSE", "Chart House", "OBSERVATORY", "CARTOGRAPHY", 1, {"SCIENCE": 3, "GOLD": 1},
         "Surveyors compare measured bearings and prepare reproducible charts for journeys by land and sea."),
        ("MILLWRIGHTS_HALL", "Millwrights' Hall", "KILN", "MACHINERY", 1, {"PRODUCTION": 3, "SCIENCE": 1},
         "Craftspeople fit cams, shafts and gearing to put water and wind to repeated mechanical work."),
        ("MANUSCRIPT_HOUSE", "Manuscript House", "UNIVERSITY", "EDUCATION", 2, {"SCIENCE": 3, "CULTURE": 1},
         "Copyists and scholars exchange manuscripts, compare readings and prepare works for instruction."),
        ("RIGGING_LOFT", "Rigging Loft", "SHIPYARD", "SHIPBUILDING", 2, {"PRODUCTION": 3, "GOLD": 1},
         "Cordage is measured, laid and stored under cover before a ship is fitted for a long passage."),
        ("FOUNDRY_OFFICE", "Foundry Office", "ARMORER", "METAL_CASTING", 2, {"PRODUCTION": 3, "SCIENCE": 1},
         "Pattern records and inspected castings keep foundry work consistent across successive orders."),
        ("DRAINAGE_WORKS", "Drainage Works", "HOSPITAL", "URBAN_PLANNING", 1, {"HAPPINESS": 3, "FOOD": 1},
         "Maintained drains separate standing waste water from the crowded spaces in which people live."),
    ],
    "modern": [
        ("PRESSURE_LAB", "Pressure Laboratory", "SCHOOLHOUSE", "STEAM_ENGINE", 1, {"SCIENCE": 4, "PRODUCTION": 1},
         "Engineers test pressure vessels and compare instruments before steam machinery enters service."),
        ("SANITATION_OFFICE", "Sanitation Office", "CITY_PARK", "URBANIZATION", 2, {"HAPPINESS": 4, "SCIENCE": 1},
         "Neighbourhood surveys guide water, waste and public health work through crowded streets."),
        ("MACHINE_TOOL_SHOP", "Machine Tool Shop", "FACTORY", "INDUSTRIALIZATION", 1, {"PRODUCTION": 4, "SCIENCE": 1},
         "Precision tools cut components against common measurements so that worn parts can be replaced."),
        ("SIGNAL_EXCHANGE", "Signal Exchange", "RADIO_STATION", "RADIO", 2, {"CULTURE": 4, "SCIENCE": 1},
         "Scheduled transmissions and maintained receivers link communities to a shared stream of information."),
        ("COMPUTING_BUREAU", "Computing Bureau", "LABORATORY", "COMPUTATION", 2, {"SCIENCE": 4, "GOLD": 1},
         "Programmed calculations replace repeated clerical arithmetic while preserving a record of the method."),
        ("FLIGHT_TEST_CENTRE", "Flight Test Centre", "LABORATORY", "AERODYNAMICS", 1, {"SCIENCE": 4, "PRODUCTION": 1},
         "Measured trials compare airframes and control surfaces before their designs are adopted."),
    ],
}

UNITS = {
    "antiquity": [
        ("COASTAL_CUTTER", "Coastal Cutter", "GALLEY", "SAILING", 2, "sail"),
        ("SKIRMISH_SPEARS", "Skirmish Spears", "SPEARMAN", "BRONZE_WORKING", 2, "shield"),
        ("MOUNTED_COURIERS", "Mounted Couriers", "HORSEMAN", "MILITARY_TRAINING", 1, "shield"),
        ("FIELD_SLINGERS", "Field Slingers", "SLINGER", "ANIMAL_HUSBANDRY", 2, "shield"),
    ],
    "exploration": [
        ("PATROL_COG", "Patrol Cog", "COG", "CARTOGRAPHY", 2, "sail"),
        ("ROAD_SERJEANTS", "Road Serjeants", "SWORDSMAN", "FEUDALISM", 1, "shield"),
        ("MOUNTED_SCOUTS", "Mounted Scouts", "KNIGHT", "HERALDRY", 2, "shield"),
        ("MATCHLOCK_SCREEN", "Matchlock Screen", "ARQUEBUSIER", "GUNPOWDER", 2, "shield"),
    ],
    "modern": [
        ("DISPATCH_RIDERS", "Dispatch Riders", "CUIRASSIER", "MILITARY_SCIENCE", 2, "shield"),
        ("PATROL_FRIGATE", "Patrol Frigate", "FRIGATE", "STEAM_ENGINE", 2, "sail"),
        ("MOTOR_SCOUTS", "Motor Scouts", "LANDSHIP", "COMBUSTION", 2, "wheel"),
        ("LIGHT_INFANTRY", "Light Infantry", "INFANTRY_COMPANY", "MOBILIZATION", 1, "shield"),
    ],
}
