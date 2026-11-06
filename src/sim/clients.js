/* ===== sim/clients.js: client generation, the consult, memory and returns (PR 3) =====
   Everyone who sits in the chair is a persistent record (docs/SIM-CONTRACT.md "A client (full record)"). All of them are
   adults: makeClient draws an age from AGE_BANDS (18..75) and never anything younger. Mostograd is a port city, so most
   names are Russian with a sprinkling from the Caucasus, Tatarstan, the Baltic, West Africa and further off (NAMES).
     CLIENT_TRAITS      how each trait (0..1) is drawn; job and age nudge some of them
     NAMES              given names by pronoun set and surnames, in name groups with a broad skin-tone range
     JOBS               job titles (their words line up with design.js JOB_COVER), with an explicit cover need, sun
                        exposure and pay; client.cover copies the job's cover so scoring can switch to it later
     BRIEFS             ~50 opening briefs with {slots}, each with a theme, tags, styles, size and placements
     HIDDEN_WANTS       must-haves and dealbreakers a client keeps to themselves until asked, with the line that reveals them
     BAD_IDEAS          what an artist should talk a client out of (tiny script, a portrait on the hand, ...)
     CONSULT_QUESTIONS  what the artist can ask; each reveals one hidden thing with a chance scaled by the consult skill
     QUOTE              rate by stage, deposit, willingness to pay, the three quote options
     LOYALTY            how loyalty moves (scaled by the client's loyalty trait)
     REVIEWS            review text by heal grade x loyalty band
     RETURN_RULES       add-on, sleeve, cover-up of someone else's work, cover-up of your own early work, touch-up
     REFERRAL           word of mouth after a piece heals
   Functions (all take an rng; never Math.random):
     SIM.makeClient(r, opts) -> client          SIM.clientAge(client, year)
     SIM.consultStart(client, S) -> consult     SIM.consultOptions(consult) -> [{id, text, kind}]
     SIM.consultChoose(consult, choiceId, r) -> a NEW consult (the old one is untouched)
     SIM.consultCommit(S, consult) -> {client, item}   writes the result into S (client record, history, booking, deposit)
     SIM.clientLog(client, entry)               SIM.loyaltyBump(client, kind)          SIM.writeReview(client, piece, r)
     SIM.referral(client, r, opts) -> client    SIM.scheduleReturns(S, r) -> [queue items]
     SIM.addPiece(S, {client, design, out, heal}) -> piece                              SIM.findClient(S, id)
   Time is (w, y): week 1..52 of year 2000..2030. SIM.weekIndex(w, y) counts weeks from week 1 of 2000.
   Private helpers start with cl. ===== */

/* ---- time ---- */
const WEEKS_PER_YEAR=52;
function weekIndex(w,y){return (y-2000)*WEEKS_PER_YEAR+(w-1);}
function weekFrom(i){i=Math.max(0,Math.floor(i));return{w:i%WEEKS_PER_YEAR+1,y:2000+Math.floor(i/WEEKS_PER_YEAR)};}
const clNow=S=>weekIndex(S.week,S.year);

/* ---- traits: each drawn from a clamped normal, then nudged ---- */
const CLIENT_TRAITS={
  pain:{mean:0.5,sd:0.2,desc:"pain tolerance: 1 sits like a rock, 0 can't keep still"},
  sun:{mean:0.4,sd:0.2,job:0.6,desc:"sun exposure: the job's sun counts for job share, the rest is dachas and beaches"},
  aftercare:{mean:0.6,sd:0.2,age:0.002,desc:"how well they follow aftercare; a little better with age"},
  budget:{mean:0.45,sd:0.18,job:0.5,desc:"how much they will spend: blended with the job's pay"},
  loyalty:{mean:0.5,sd:0.2,age:0.003,desc:"how much they stick with one artist; a little more with age"},
  talkative:{mean:0.5,sd:0.25,desc:"chatty in the chair; talkative clients give longer consults"},
  trusting:{mean:0.5,sd:0.2,desc:"how readily they take the artist's advice"},
  lo:0.02,hi:0.98
};
/* adults only: [from, to, weight], weighted young */
const AGE_BANDS=[[18,24,30],[25,34,32],[35,44,18],[45,54,10],[55,64,6],[65,75,4]];
const PRONOUNS=[["she/her",0.48],["he/him",0.44],["they/them",0.08]];
const PRONOUN_WORDS={"she/her":{pr:"she",pos:"her",obj:"her"},"he/him":{pr:"he",pos:"his",obj:"him"},"they/them":{pr:"they",pos:"their",obj:"them"}};
/* body shape by pronoun set */
const BODY_BY_PRONOUN={"she/her":{femme:0.72,neutral:0.22,masc:0.06},"he/him":{masc:0.72,neutral:0.22,femme:0.06},"they/them":{neutral:0.6,femme:0.2,masc:0.2}};
/* patronymic address: clients this old get "first + patronymic" in conversation */
const FORMAL_AGE=50;

/* ---- names: groups with weight and a broad skin-tone range. surnames are [masculine, feminine] pairs or a single
   indeclinable form; they/them clients take an indeclinable surname where the group has one. Lombard's regulars and
   specialists (and well-known public figures) are deliberately absent. ---- */
const NAMES={
  neutral:["Sasha","Zhenya","Valya","Slava","Shura","Tosha","Alex","Robin","Noa","Kai","Ari"],
  groups:[
    {id:"ru",w:0.72,tone:[0,0.5],patronymic:true,
      he:["Aleksei","Andrei","Anton","Artyom","Boris","Daniil","Denis","Dmitri","Fyodor","Gleb","Grigory","Igor","Ilya","Kirill","Konstantin",
        "Leonid","Maksim","Matvei","Mikhail","Nikolai","Oleg","Pavel","Pyotr","Roman","Semyon","Stepan","Timofei","Vadim","Viktor","Yaroslav","Yegor","Yuri"],
      she:["Alina","Alyona","Anastasia","Anna","Darya","Ekaterina","Elena","Galina","Irina","Kira","Ksenia","Larisa","Lidia","Lyudmila","Margarita",
        "Maria","Marina","Nadezhda","Natalya","Nina","Olga","Polina","Svetlana","Tamara","Tatyana","Ulyana","Valentina","Vera","Viktoria","Yulia","Zoya"],
      they:["Sasha","Zhenya","Valya","Slava","Shura","Tosha"],
      surnames:[["Sorokin","Sorokina"],["Belov","Belova"],["Volkov","Volkova"],["Zaitsev","Zaitseva"],["Morozov","Morozova"],["Lebedev","Lebedeva"],
        ["Kozlov","Kozlova"],["Novikov","Novikova"],["Sokolov","Sokolova"],["Fedorov","Fedorova"],["Smirnov","Smirnova"],["Kuznetsov","Kuznetsova"],
        ["Egorov","Egorova"],["Nikitin","Nikitina"],["Zakharov","Zakharova"],["Kovalyov","Kovalyova"],["Gusev","Guseva"],["Titov","Titova"],
        ["Komarov","Komarova"],["Kiselyov","Kiselyova"],["Makarov","Makarova"],["Ilyin","Ilyina"],["Gromov","Gromova"],["Rybakov","Rybakova"],
        ["Golubev","Golubeva"],["Shirokov","Shirokova"],["Tikhonov","Tikhonova"],["Vorobyov","Vorobyova"],["Lapin","Lapina"],["Polyakov","Polyakova"],
        ["Zarechny","Zarechnaya"],["Lodochnikov","Lodochnikova"],["Kanatov","Kanatova"],["Pristanev","Pristaneva"],
        "Petrenko","Bondarenko","Kovalenko","Shevchuk","Kravets","Melnik","Savchuk","Lysenko"]},
    {id:"ru_korean",w:0.03,tone:[0.1,0.45],patronymic:true,from:"ru",surnames:["Kim","Pak","Li","Ten","Khegai","Nam"]},
    {id:"tatar",w:0.07,tone:[0.1,0.55],patronymic:false,
      he:["Rustam","Ildar","Timur","Marat","Rinat","Azat"],she:["Aigul","Dilyara","Alsu","Gulnara","Leysan","Elmira"],
      surnames:[["Safin","Safina"],["Valiev","Valieva"],["Nurullin","Nurullina"],["Khairullin","Khairullina"],["Galiev","Galieva"],["Ismagilov","Ismagilova"]]},
    {id:"caucasus",w:0.06,tone:[0.15,0.6],patronymic:false,
      he:["Giorgi","Levan","Davit","Gor","Aram","Nodar"],she:["Nino","Mariam","Ani","Lusine","Eka","Salome"],
      surnames:["Beridze","Kapanadze","Lomidze","Gelashvili","Hakobyan","Avetisyan","Mkrtchyan","Grigoryan"]},
    {id:"baltic",w:0.04,tone:[0,0.3],patronymic:false,
      he:["Juhan","Mati","Toomas","Arvo","Janis"],she:["Aino","Liis","Kadri","Ilze","Maarja"],surnames:["Tamm","Saar","Kask","Magi","Lepp","Ozols"]},
    {id:"westafrica",w:0.03,tone:[0.6,1],patronymic:false,
      he:["Kwame","Chidi","Emeka","Kofi","Tunde"],she:["Amara","Adaeze","Efua","Ngozi","Abena"],they:["Ayo","Sena"],
      surnames:["Okafor","Mensah","Adeyemi","Boateng","Eze","Asante"]},
    {id:"eastasia",w:0.02,tone:[0.1,0.45],patronymic:false,
      he:["Wei","Hao","Jun"],she:["Mei","Lin","Xiu"],they:["Yu"],surnames:["Chen","Wang","Liu","Zhao"]},
    {id:"far",w:0.03,tone:[0.1,0.75],patronymic:false,
      he:["Mateo","Joao","Yusuf","Diego","Karim"],she:["Ines","Lucia","Leila","Sofia","Yasmin"],they:["Noa","Kai"],
      surnames:["Ferreira","Haddad","Costa","Morales","Rahimi","Duarte"]}
  ],
  /* fathers' names -> [masculine, feminine] patronymic (only the "ru" groups use them) */
  patronymics:[["Ivanovich","Ivanovna"],["Sergeyevich","Sergeyevna"],["Nikolayevich","Nikolayevna"],["Petrovich","Petrovna"],
    ["Aleksandrovich","Aleksandrovna"],["Mikhailovich","Mikhailovna"],["Vasilyevich","Vasilyevna"],["Andreyevich","Andreyevna"],
    ["Yuryevich","Yuryevna"],["Viktorovich","Viktorovna"],["Olegovich","Olegovna"],["Pavlovich","Pavlovna"],["Grigoryevich","Grigoryevna"],
    ["Borisovich","Borisovna"],["Leonidovich","Leonidovna"],["Fyodorovich","Fyodorovna"]]
};

/* ---- jobs. name words line up with design.js JOB_COVER (tools/sim-test.js checks they agree within 0.25);
   cover = how much it needs tattoos hidden, sun = daylight on the job, pay 0..1, w = how common,
   from/to = the years the job exists, ages = [min, max] age for it ---- */
const JOBS=[
  {name:"bank clerk",cover:0.85,sun:0.1,pay:0.5,w:1.2},
  {name:"notary's assistant",cover:0.9,sun:0.1,pay:0.5,w:0.5},
  {name:"accountant at the port authority",cover:0.75,sun:0.1,pay:0.6,w:0.8},
  {name:"civil servant at the district office",cover:0.8,sun:0.1,pay:0.5,w:0.8},
  {name:"school teacher",cover:0.65,sun:0.2,pay:0.35,w:1,ages:[23,66]},
  {name:"nurse at the city hospital",cover:0.5,sun:0.1,pay:0.35,w:1,ages:[20,66]},
  {name:"doctor at the polyclinic",cover:0.6,sun:0.1,pay:0.6,w:0.6,ages:[25,70]},
  {name:"police officer",cover:0.7,sun:0.5,pay:0.45,w:0.5,ages:[20,60]},
  {name:"hotel receptionist",cover:0.6,sun:0.05,pay:0.35,w:0.8},
  {name:"sales assistant on Kanatnaya Street",cover:0.5,sun:0.1,pay:0.3,w:1.2},
  {name:"waiter at a canal cafe",cover:0.35,sun:0.3,pay:0.3,w:1.2,ages:[18,45]},
  {name:"chef",cover:0.1,sun:0.05,pay:0.5,w:0.8},
  {name:"line cook",cover:0.1,sun:0.05,pay:0.3,w:0.8,ages:[18,50]},
  {name:"builder",cover:0.1,sun:0.85,pay:0.45,w:1},
  {name:"bicycle courier",cover:0.1,sun:0.85,pay:0.25,w:0.6,ages:[18,40]},
  {name:"delivery app courier",cover:0.1,sun:0.8,pay:0.25,w:1,from:2016,ages:[18,45]},
  {name:"car mechanic",cover:0.1,sun:0.2,pay:0.4,w:0.8},
  {name:"dock worker",cover:0.1,sun:0.8,pay:0.45,w:1},
  {name:"crane operator at the docks",cover:0.1,sun:0.6,pay:0.55,w:0.6},
  {name:"session musician",cover:0,sun:0.1,pay:0.3,w:0.6},
  {name:"barista",cover:0.1,sun:0.1,pay:0.25,w:0.9,from:2006,ages:[18,40]},
  {name:"university student",cover:0.2,sun:0.3,pay:0.1,w:1.6,ages:[18,28]},
  {name:"art student",cover:0.2,sun:0.2,pay:0.1,w:0.6,ages:[18,28]},
  {name:"illustrator",cover:0.15,sun:0.1,pay:0.4,w:0.5},
  {name:"tram driver",cover:0.3,sun:0.3,pay:0.4,w:0.7,ages:[21,65]},
  {name:"bridge operator",cover:0.3,sun:0.3,pay:0.4,w:0.4,ages:[21,65]},
  {name:"tour boat skipper",cover:0.2,sun:0.9,pay:0.45,w:0.5,ages:[21,70]},
  {name:"ferry deckhand",cover:0.1,sun:0.85,pay:0.3,w:0.5,ages:[18,55]},
  {name:"fisherman",cover:0.1,sun:0.9,pay:0.35,w:0.4},
  {name:"gardener at the botanical garden",cover:0.1,sun:0.9,pay:0.3,w:0.5},
  {name:"market trader",cover:0.2,sun:0.6,pay:0.4,w:0.7},
  {name:"baker",cover:0.2,sun:0.05,pay:0.3,w:0.6},
  {name:"florist",cover:0.2,sun:0.2,pay:0.3,w:0.5},
  {name:"taxi driver",cover:0.25,sun:0.4,pay:0.35,w:0.8,ages:[21,70]},
  {name:"hairdresser",cover:0.1,sun:0.05,pay:0.35,w:0.8},
  {name:"programmer",cover:0.25,sun:0.05,pay:0.7,w:0.9},
  {name:"museum guide",cover:0.45,sun:0.1,pay:0.3,w:0.5},
  {name:"librarian",cover:0.35,sun:0.05,pay:0.25,w:0.4},
  {name:"pharmacist",cover:0.45,sun:0.05,pay:0.45,w:0.5,ages:[23,70]},
  {name:"dentist",cover:0.45,sun:0.05,pay:0.7,w:0.4,ages:[25,70]},
  {name:"postal worker",cover:0.35,sun:0.45,pay:0.3,w:0.5},
  {name:"street cleaner",cover:0.1,sun:0.8,pay:0.2,w:0.4},
  {name:"lift engineer",cover:0.15,sun:0.1,pay:0.45,w:0.4},
  {name:"theatre stagehand",cover:0.1,sun:0.05,pay:0.3,w:0.4},
  {name:"social media manager",cover:0.15,sun:0.05,pay:0.5,w:0.8,from:2014,ages:[20,45]},
  {name:"yoga instructor",cover:0.1,sun:0.2,pay:0.35,w:0.4,from:2008},
  {name:"security guard",cover:0.3,sun:0.3,pay:0.3,w:0.5},
  {name:"tattoo artist at another shop",cover:0,sun:0.1,pay:0.4,w:0.15,ages:[20,60]},
  {name:"merchant sailor",cover:0.1,sun:0.8,pay:0.5,w:0.5,ages:[20,62]},
  {name:"port diver",cover:0.1,sun:0.5,pay:0.5,w:0.1,ages:[22,60]},
  {name:"lighthouse keeper",cover:0.1,sun:0.6,pay:0.3,w:0.05,ages:[25,75]},
  {name:"retired",cover:0.1,sun:0.4,pay:0.3,w:2,ages:[58,99]}
];

const JOB_AGES=[18,66];   // working ages for a job with no ages of its own
/* ---- brief slots. Values that bring tags add them to the client's wants ---- */
const BRIEF_SLOTS={
  person:[{t:"grandmother",p:"she"},{t:"grandfather",p:"he"},{t:"mum",p:"she"},{t:"dad",p:"he"},{t:"aunt",p:"she"},{t:"uncle",p:"he"},
    {t:"godmother",p:"she"},{t:"godfather",p:"he"},{t:"older brother",p:"he"},{t:"sister",p:"she"},{t:"best friend",p:"they"},{t:"old neighbour",p:"she"}],
  loved:[{t:"gardens",tags:["botanical","flower"]},{t:"the sea",tags:["ocean","nautical"]},{t:"birds",tags:["bird"]},
    {t:"the forest at the dacha",tags:["forest","nature"]},{t:"the night sky",tags:["night","sky"]},{t:"the White Nights",tags:["night","sky"]},
    {t:"the swans on the canal",tags:["bird"]},{t:"mushroom picking",tags:["forest","nature"]},{t:"cats",tags:["pet","animal"]}],
  habit:[{t:"feed the swans on the canal every Sunday",tags:["bird"]},{t:"pick mushrooms every autumn",tags:["forest","nature"]},
    {t:"keep geraniums on every windowsill",tags:["botanical","flower"]},{t:"watch the bridges go up at night",tags:["night","sky"]},
    {t:"sail out past the harbour on Sundays",tags:["nautical","ocean"]},{t:"read the stars to anyone who'd listen",tags:["sky","star"]}],
  flower:[{t:"roses",tags:["flower"]},{t:"peonies",tags:["flower"]},{t:"daisies",tags:["flower"]},{t:"chrysanthemums",tags:["flower"]},{t:"lotus flowers",tags:["flower"]}],
  petName:[{t:"Murka"},{t:"Barsik"},{t:"Vaska"},{t:"Pushok"},{t:"Belka"},{t:"Sharik"},{t:"Ryzhik"},{t:"Bublik"},{t:"Kesha"},{t:"Tuman"},{t:"Kefir"}],
  workplace:[{t:"the tram depot"},{t:"the shipyard"},{t:"the post"},{t:"the city hospital"},{t:"the bakery on Kanatnaya Street"},{t:"the port"},{t:"the bridge office"}],
  partner:[{t:"husband"},{t:"wife"},{t:"partner"},{t:"fiance"},{t:"girlfriend"},{t:"boyfriend"}]
};
/* size classes: [min, max] mm for the ask; wants.sizeMm widens it */
const SIZE_CLASSES={tiny:[8,25],small:[25,65],medium:[60,130],large:[120,260],huge:[220,560]};
/* how much colour a style's fans want (0 = black and grey only) */
const STYLE_COLOUR={traditional:0.7,neotrad:0.8,blackwork:0,fineline:0.1,realism:0.25,japanese:0.8,lettering:0.05,geometric:0.05,watercolour:0.95};
/* placement shorthand in briefs: a base id ("forearm" -> forearm_l or forearm_r) or a full PLACEMENTS id */

/* ---- the briefs. text slots: {person} {Pr} {pr} {pos} {loved} {habit} {flower} {petName} {place} {workplace} {partner}
   {pastYear}. theme groups them; tags must exist in ELEMENTS (tested); styles are the styles it suits; size is a
   SIZE_CLASSES id; place lists where it can go; seg are STYLES clientSegments it draws; known: dealbreakers/must-haves
   the brief states out loud; first = a first tattoo; from/to = years it can appear; ages = [min, max] client age (a brief
   that looks back at {pastYear} needs 20+ so that year was an adult one too); job = the job (or jobs) the brief implies ---- */
const BRIEFS=[
  /* memorial */
  {id:"mem_grandma",theme:"memorial",text:"Something for my {person}. {Pr} loved {loved}. Nothing too girly. {Place}, please.",tags:["memorial"],
    styles:["fineline","neotrad","traditional","realism"],size:"medium",place:["forearm","upperarm","calf"],seg:["memorial"],known:{deal:[{kind:"tag",v:"cute"}]}},
  {id:"mem_habit",theme:"memorial",text:"My {person} passed in the spring. {Pr} used to {habit}. I want something small I can see every day, on my {place}.",
    tags:["memorial"],styles:["fineline","traditional","watercolour"],size:"small",place:["forearm","hand","shoulder"],seg:["memorial"]},
  {id:"mem_flower",theme:"memorial",text:"I want my {person}'s favourite flower. {Pr} grew {flower} on the balcony every summer, even the year the frost came in May.",
    tags:["flower","botanical"],styles:["fineline","neotrad","watercolour","traditional","japanese"],size:"medium",place:["forearm","upperarm","shoulder","calf","thigh"],seg:["memorial"]},
  {id:"mem_bridge",theme:"memorial",text:"We scattered my {person}'s ashes off the Old Bridge. Something with water in it. {Place}.",tags:["water","memorial"],
    styles:["fineline","japanese","geometric"],size:"medium",place:["forearm","upperarm","calf","ribs"],seg:["memorial"]},
  {id:"mem_boats",theme:"memorial",text:"My {person} worked forty years on the boats. An anchor, or a lighthouse. Something {pr} would have recognised from across the harbour.",
    tags:["nautical","memorial"],styles:["traditional","neotrad","blackwork"],size:"medium",place:["forearm","upperarm","calf"],seg:["memorial","old_school"]},
  {id:"mem_candle",theme:"memorial",text:"A candle for my {person}. Simple. {Pr} always left one burning in the window on Lodochnaya Embankment.",tags:["light","memorial"],
    styles:["traditional","neotrad","fineline"],size:"small",place:["forearm","upperarm","calf"],seg:["memorial"]},
  {id:"mem_watch",theme:"memorial",text:"My {person}'s pocket watch stopped the week {pr} died. I'd like it on my {place}, stopped at that time.",tags:["time","memorial"],
    styles:["realism","traditional","neotrad"],size:"medium",place:["forearm","upperarm","calf","chest_l"],seg:["memorial"]},
  {id:"mem_song",theme:"memorial",text:"My {person} sang all day, every day, like a little bird. I want a bird for {pos} song. {Place}.",tags:["bird","memorial"],
    styles:["fineline","traditional","watercolour","neotrad"],size:"small",place:["forearm","shoulder","nape"],seg:["memorial"]},
  {id:"mem_hands",theme:"memorial",text:"I want my {person}'s heartbeat line. The hospital gave us the printout and I've kept it in my wallet for two years.",tags:["memorial","life"],
    styles:["fineline","lettering"],size:"small",place:["forearm","ribs","chest_l"],seg:["memorial"]},
  /* milestones */
  {id:"ms_flat",ages:[30,75],theme:"milestone",text:"I finally paid off the flat. Twelve years. I want something to mark it, a key maybe, on my {place}.",tags:["key","home"],
    styles:["traditional","neotrad","fineline"],size:"small",place:["forearm","upperarm","calf"],seg:["walk_in"]},
  {id:"ms_shipyard",ages:[28,70],job:["dock worker","crane operator at the docks","builder","merchant sailor"],theme:"milestone",text:"Ten years at {workplace} as of Friday. I want a ship's wheel or an anchor. Proper old-school.",tags:["nautical"],
    styles:["traditional","blackwork"],size:"medium",place:["forearm","upperarm","calf"],seg:["trades","old_school"]},
  {id:"ms_captain",ages:[25,70],job:["tour boat skipper","ferry deckhand","merchant sailor"],theme:"milestone",text:"I got my captain's papers. A compass, bold, so it still reads when I'm seventy. {Place}.",tags:["direction","nautical"],
    styles:["traditional","blackwork","geometric"],size:"medium",place:["forearm","upperarm","chest_l","chest_r"],seg:["trades","old_school"]},
  {id:"ms_marathon",theme:"milestone",text:"I ran the White Nights half marathon. My knees are still angry. Something about feeling light, a feather or birds.",tags:["freedom"],
    styles:["fineline","watercolour","blackwork"],size:"small",place:["calf","ribs","forearm","shoulder"],seg:["first_timer"]},
  {id:"ms_retired",ages:[58,75],job:"retired",theme:"milestone",text:"I retired on Monday. Forty-one years at {workplace}. Now I want something just for me, and I want it big.",tags:["freedom"],
    styles:["traditional","japanese","neotrad","realism"],size:"large",place:["upperarm","thigh","upperback","calf"],seg:["old_school"]},
  {id:"ms_wedding",theme:"milestone",text:"My {partner} and I are getting married in June. I want the date in Roman numerals on my {place}.",tags:["date"],
    styles:["lettering","fineline"],size:"small",place:["forearm","ribs","chest_l","nape"],seg:["couples"]},
  {id:"ms_moved",ages:[23,75],theme:"milestone",text:"I came to Mostograd five years ago with one suitcase. Now it's home. I want something that says that.",tags:["home"],
    styles:["traditional","fineline","lettering","neotrad"],size:"small",place:["forearm","upperarm","ribs"],seg:["travellers"]},
  {id:"ms_degree",ages:[24,45],theme:"milestone",text:"I defended my thesis yesterday. Six years. An owl is a cliche, I know. I want the owl.",tags:["wisdom"],
    styles:["neotrad","blackwork","realism"],size:"medium",place:["upperarm","forearm","calf","thigh"],seg:["students"]},
  /* pets */
  {id:"pet_cat",theme:"pets",text:"My cat {petName} is the boss of our whole building. I want {petName} on my {place} while she's still ruling it.",tags:["pet"],
    styles:["fineline","neotrad","blackwork","realism"],size:"small",place:["forearm","upperarm","calf"],seg:["pet_owners"]},
  {id:"pet_paw",theme:"pets",text:"Our dog {petName} died last winter. Just a paw print, maybe with a little heart. {Place}.",tags:["pet","memorial"],
    styles:["fineline","traditional"],size:"tiny",place:["forearm","hand","foot","shoulder"],seg:["pet_owners","memorial"],known:{must:[{kind:"tag",v:"pet"}]}},
  {id:"pet_portrait_hand",theme:"pets",text:"I want a realistic portrait of my dog {petName}. On the back of my hand, so I see him every day.",tags:["pet","animal"],
    styles:["realism"],size:"small",place:["hand"],seg:["pet_owners"]},
  {id:"pet_rabbit",theme:"pets",text:"A little rabbit for {petName}, who has chewed through every cable in the flat and is completely unrepentant.",tags:["pet","cute"],
    styles:["fineline","neotrad"],size:"small",place:["forearm","calf","shoulder","foot"],seg:["pet_owners"]},
  {id:"pet_parrot",ages:[30,75],theme:"pets",text:"My parrot {petName} is twenty-six and has outlived two of my sofas. He deserves a tattoo. Something bright.",tags:["bird","animal"],
    styles:["neotrad","watercolour","traditional"],size:"medium",place:["upperarm","forearm","calf"],seg:["pet_owners"]},
  /* travel */
  {id:"tr_swallow",job:["merchant sailor","ferry deckhand","fisherman"],theme:"travel",text:"Just back from six months at sea. A swallow, the old way. My first five thousand miles.",tags:["bird","nautical"],
    styles:["traditional","neotrad"],size:"small",place:["chest_l","chest_r","hand","forearm"],seg:["trades","old_school"]},
  {id:"tr_plane",theme:"travel",text:"A paper plane, small, on my {place}. I'm leaving for a job abroad and I'm coming back, I promised my mum.",tags:["travel","freedom"],
    styles:["fineline"],size:"tiny",place:["forearm","hand","nape","foot"],seg:["travellers","first_timer"]},
  {id:"tr_mountains",theme:"travel",text:"Mountains. I walked the whole northern ridge last summer and I still dream about it. Wrapped round my {place} if that's a thing.",tags:["outdoors","nature"],
    styles:["fineline","geometric","blackwork"],size:"medium",place:["forearm","calf","upperarm"],seg:["travellers"]},
  {id:"tr_compass",theme:"travel",text:"A compass rose. I grew up by the port and I always want to know which way the sea is.",tags:["direction","travel"],
    styles:["traditional","geometric","blackwork"],size:"medium",place:["forearm","upperarm","calf","shoulder"],seg:["travellers"]},
  {id:"tr_whale",theme:"travel",text:"A whale tail. We saw one from the northern ferry and nobody at work believes me.",tags:["ocean","travel"],
    styles:["fineline","watercolour","blackwork"],size:"small",place:["forearm","ribs","calf","foot"],seg:["travellers"]},
  /* nature */
  {id:"nat_fern",theme:"nature",text:"A fern, fine line, running down my {place}. Every weekend I'm out at the dacha in the woods.",tags:["botanical","nature"],
    styles:["fineline","realism"],size:"medium",place:["forearm","ribs","calf","upperarm"],seg:["office","students"]},
  {id:"nat_mushroom",theme:"nature",text:"Mushrooms. I'm serious. Mushroom season is the best two weeks of my year.",tags:["forest","nature"],
    styles:["neotrad","fineline","traditional"],size:"small",place:["calf","forearm","shin","upperarm"],seg:["creatives"]},
  {id:"nat_moon",theme:"nature",text:"The moon in all its phases, across my {place}. I work nights and the moon is my only colleague.",tags:["moon","night"],
    styles:["fineline","geometric","blackwork"],size:"medium",place:["forearm","nape","upperback","sternum"],seg:["creatives","office"]},
  {id:"nat_bees",theme:"nature",text:"Bees. My grandfather kept them, and now I keep two hives on the roof on Kanatnaya Street.",tags:["insect","work"],
    styles:["neotrad","traditional","blackwork"],size:"small",place:["forearm","hand","upperarm","calf"],seg:["creatives"]},
  {id:"nat_birds",theme:"nature",text:"Birds flying, on my {place}. I watch them over the canal from my kitchen window every morning.",tags:["bird","freedom"],
    styles:["fineline","watercolour"],size:"small",place:["forearm","shoulder","ribs","nape"],seg:["first_timer","office"]},
  {id:"nat_wolf",theme:"nature",text:"A wolf. I don't want to explain it. I just want a wolf, and I want it to look like it means it.",tags:["wild","animal"],
    styles:["blackwork","realism","traditional","geometric"],size:"medium",place:["upperarm","thigh","calf","forearm"],seg:["collector","walk_in"]},
  /* nautical */
  {id:"nau_anchor",theme:"nautical",text:"An anchor with a rope round it. Proper sailor's work. My father had one just like it from his navy days.",tags:["nautical"],
    styles:["traditional","blackwork"],size:"medium",place:["forearm","upperarm","calf"],seg:["old_school","trades"]},
  {id:"nau_lighthouse",ages:[25,75],job:"lighthouse keeper",theme:"nautical",text:"A lighthouse, bold, on my {place}. I keep the light at the harbour mouth. It's about time I wore it.",tags:["coast","guidance"],
    styles:["traditional","neotrad"],size:"medium",place:["upperarm","forearm","calf","thigh"],seg:["trades","old_school"]},
  {id:"nau_octopus",ages:[22,60],job:"port diver",theme:"nautical",text:"An octopus wrapped round my {place}. I dive at the port for a living and I love the strange ones.",tags:["ocean"],
    styles:["neotrad","traditional","blackwork"],size:"large",place:["upperarm","calf","thigh"],seg:["collector","trades"]},
  {id:"nau_wave",theme:"nautical",text:"A big wave. I want my {place} to look like the river the night the dam gates opened.",tags:["water","ocean"],
    styles:["japanese","blackwork"],size:"large",place:["upperarm","thigh","calf","upperback"],seg:["large_scale","collector"]},
  /* first tattoos */
  {id:"first_small",theme:"first",text:"It's my first one. Something small. A heart? A star? I honestly don't know. What do people get?",tags:["small"],first:true,
    styles:["fineline","traditional"],size:"tiny",place:["forearm","ribs","foot","shoulder","nape"],seg:["first_timer","walk_in"]},
  {id:"first_needles",theme:"first",text:"First tattoo. I've wanted one for years and I've finally stopped being scared of needles. Mostly.",tags:["flower"],first:true,
    styles:["fineline","traditional","neotrad"],size:"small",place:["forearm","upperarm","calf","shoulder"],seg:["first_timer"]},
  {id:"first_word",theme:"first",text:"All my friends have one and I'm the last. Something tiny on my wrist. A word, maybe. Hope.",tags:["script","hope"],first:true,
    styles:["lettering","fineline"],size:"tiny",place:["forearm"],seg:["first_timer","students"]},
  {id:"first_hide",theme:"first",text:"First tattoo, and my mother will be at New Year dinner, so somewhere I can hide it. Something with the sun in it.",tags:["sun"],first:true,
    styles:["fineline","traditional","geometric"],size:"small",place:["ribs","upperarm","thigh","shoulder"],seg:["first_timer"]},
  {id:"first_sparkle",theme:"first",text:"I saw a tiny sparkle on someone on the tram and I haven't stopped thinking about it for a month.",tags:["star"],first:true,
    styles:["fineline"],size:"tiny",place:["forearm","hand","nape","foot"],seg:["first_timer","fashion"]},
  {id:"first_online",theme:"first",text:"First one. I saved about four hundred pictures. Can we make something out of these? Fine line, botanical.",tags:["botanical"],first:true,from:2016,
    styles:["fineline","watercolour"],size:"small",place:["forearm","ribs","upperarm","calf"],seg:["first_timer","fashion"]},
  /* cover-ups of someone else's work */
  {id:"cov_name",theme:"coverup",text:"I have a name on my {place} from a shop that isn't there any more. Please put it under something better. Anything dark.",tags:["botanical"],
    styles:["blackwork","neotrad","japanese","traditional"],size:"medium",place:["forearm","upperarm","calf","shoulder"],seg:["cover_up"],known:{deal:[{kind:"tag",v:"script"}]}},
  {id:"cov_band",ages:[22,75],theme:"coverup",text:"I got a barbed-wire band in {pastYear} on a dare. Make it into something I'm not embarrassed by at the beach.",tags:["band"],from:2004,
    styles:["blackwork","geometric","japanese"],size:"medium",place:["upperarm","calf"],seg:["cover_up"]},
  {id:"cov_party",ages:[20,75],theme:"coverup",text:"A friend did this with a sewing needle at a party in {pastYear}. It was meant to be a star. Can you cover it?",tags:["star"],from:2002,
    styles:["blackwork","traditional","neotrad"],size:"small",place:["hand","forearm","foot"],seg:["cover_up","walk_in"]},
  /* matching */
  {id:"match_sister",theme:"matching",text:"My sister and I want matching ones. Small, simple, both on the {place}. She's in the waiting room, she's next.",tags:["small"],
    styles:["fineline","traditional"],size:"tiny",place:["forearm","foot","nape","shoulder"],seg:["couples"]},
  {id:"match_friend",ages:[35,75],theme:"matching",text:"My best friend and I have known each other thirty years. Matching moons. Don't let us talk you into anything bigger.",tags:["moon"],
    styles:["fineline","geometric"],size:"tiny",place:["forearm","foot","hand","nape"],seg:["couples"]},
  {id:"match_padlock",theme:"matching",text:"My {partner} and I want one each. A padlock, like the ones on the Old Bridge railings. Or infinity, but that's a bit much.",tags:["love"],
    styles:["traditional","fineline","neotrad"],size:"small",place:["forearm","ribs","calf","shoulder"],seg:["couples"]},
  /* collectors */
  {id:"col_japanese",ages:[25,75],theme:"collector",text:"I want a Japanese piece on my {place}. Koi, water, the whole story. I'm in no hurry. Take a year if you need it.",tags:["japanese","water"],
    styles:["japanese"],size:"huge",place:["upperarm","thigh","fullback","upperback"],seg:["collector","large_scale"]},
  {id:"col_blackwork",ages:[22,75],theme:"collector",text:"I collect blackwork. I've seen your flash on the wall. Do what you want on my {place}, just keep it bold.",tags:["bold"],
    styles:["blackwork"],size:"large",place:["calf","upperarm","thigh","forearm"],seg:["collector"]},
  {id:"col_geometric",ages:[20,75],theme:"collector",text:"A geometric start on my {place}. Precise or don't bother. I'll know if the lines aren't straight.",tags:["geometric"],
    styles:["geometric","blackwork"],size:"large",place:["upperarm","forearm","calf","sternum"],seg:["collector","students"]},
  {id:"col_neotrad",ages:[25,75],theme:"collector",text:"A neo-trad owl, colour. I have work from four shops on this body and this one goes on my {place}.",tags:["bird","wisdom"],
    styles:["neotrad"],size:"medium",place:["thigh","calf","upperarm","forearm"],seg:["collector"]},
  {id:"col_tiger",ages:[30,75],theme:"collector",text:"A tiger. Big. My {place} has been empty for ten years waiting for the right artist.",tags:["power","animal"],
    styles:["japanese","realism","traditional"],size:"large",place:["thigh","upperback","upperarm","ribs"],seg:["collector","large_scale"]},
  /* trades */
  {id:"job_bridge",job:"bridge operator",theme:"trades",text:"I raise the Old Bridge at two in the morning, every night from April to November. Something with the moon and the river.",tags:["moon","water"],
    styles:["fineline","traditional","geometric"],size:"medium",place:["forearm","upperarm","calf"],seg:["trades"]},
  {id:"job_chef",job:["chef","line cook"],theme:"trades",text:"Chef. I want a knife on my {place}. Fine, a dagger then. Bold enough to survive the kitchen.",tags:["blade"],
    styles:["traditional","blackwork"],size:"medium",place:["forearm","upperarm"],seg:["trades","walk_in"]},
  {id:"job_garden",job:"gardener at the botanical garden",theme:"trades",text:"I look after the glasshouses at the botanical garden. Something green and growing, and colour, lots of colour.",tags:["botanical","flower"],
    styles:["neotrad","watercolour","traditional"],size:"medium",place:["forearm","upperarm","calf"],seg:["trades","creatives"]}
];

/* ---- what clients keep to themselves. kind/v is the design.js mustHave / dealbreaker shape; say is the line that
   reveals it in the consult; themes limit where a must-have makes sense ---- */
const HIDDEN_WANTS={
  mustChance:0.38,dealChance:0.45,
  must:[
    {kind:"tag",v:"date",say:"It has to have the date in it. That part isn't up for discussion.",themes:["memorial","milestone","matching"]},
    {kind:"colour",v:"red",say:"There has to be some red in it. Red was always {pos} colour.",themes:["memorial"]},
    {kind:"tag",v:"pet",say:"There needs to be a little paw print somewhere. Even tiny.",themes:["pets","memorial"]},
    {kind:"tag",v:"love",say:"I'd like a heart in it somewhere. Is that soppy? I don't care.",themes:["matching","memorial","milestone"]},
    {kind:"tag",v:"nautical",say:"Whatever you draw, it has to feel like the sea.",themes:["nautical","travel","trades"]},
    {kind:"tag",v:"flower",say:"I want flowers in it. Even if it's mainly something else.",themes:["memorial","nature","first","pets"]},
    {kind:"tag",v:"bird",say:"There has to be a bird. I can't explain it, there just does.",themes:["memorial","travel","nature","milestone"]},
    {kind:"tag",v:"script",say:"I need a word in it. Just one. You'll know which when I tell you.",themes:["memorial","milestone","first"]},
    {kind:"style",v:"traditional",say:"I want it to look old-school, like the sailors' ones. Bold.",themes:["nautical","trades","milestone"]}
  ],
  deal:[
    {kind:"tag",v:"skull",say:"No skulls. My mother would never speak to me again."},
    {kind:"tag",v:"snake",say:"Nothing with snakes. I'm not joking, I can't look at them."},
    {kind:"tag",v:"insect",say:"No bugs. Butterflies count. Don't argue."},
    {kind:"tag",v:"blade",say:"Nothing sharp. No daggers, nothing like that."},
    {kind:"style",v:"watercolour",say:"I don't want it to fade into a puddle. No watercolour."},
    {kind:"colour",v:"pink",say:"Absolutely no pink. I've had enough pink for one lifetime."},
    {kind:"tag",v:"cute",say:"Nothing cute. I'm a grown adult, not a greeting card."},
    {kind:"tag",v:"love",say:"Please, nothing soppy. No hearts."},
    {kind:"tag",v:"eye",say:"No eyes. Eyes on skin give me the creeps."},
    {kind:"tag",v:"web",say:"Not a spider web. My uncle had one and it always looked like a bruise."}
  ]
};
/* bad ideas: what a good artist talks a client out of. test(ask, client, P) says the ask is one; make(ask, r) turns
   an ask into one (BAD_IDEA_CHANCE of walk-ins arrive with one); fix(ask) is the artist's alternative.
   add: what the brief gains (addPlaced instead when the brief already names the spot).
   gentle/blunt: the two ways to say it (blunt wins more respect when it lands and loses more clients when it doesn't).
   yes: they come round; no: they walk; insist: they want it anyway */
const BAD_IDEA_CHANCE=0.22;
const BAD_IDEAS=[
  {id:"tiny_script",fits:B=>["memorial","milestone","first","matching"].indexOf(B.theme)>=0&&B.size!=="large"&&B.size!=="huge",add:" Really small, like {mm} mm, on the inside of my wrist.",
    test:(a)=>a.style==="lettering"&&a.sizeMm<20,
    make:(a,r)=>{a.style="lettering";a.sizeMm=r.int(8,14);a.placement=r.chance(0.5)?"forearm_l":"forearm_r";a.tags=["script"].concat(a.tags.filter(t=>t!=="script"));},
    fix:a=>{a.sizeMm=Math.max(35,a.sizeMm*3);},
    gentle:"I love the idea. At that size the letters close up in a few years, though. Could we go to about 40 mm so it still reads when you're sixty?",
    blunt:"At {mm} mm that word will be a smudge in five years. I've seen it a hundred times. Bigger, or I'd rather not.",
    yes:"Forty, then. I'd rather it still says something.",no:"Then I'll find someone who'll just do it. Thanks.",insist:"I want it small. That's the whole point."},
  {id:"hand_portrait",fits:B=>B.theme==="pets"&&B.styles.indexOf("realism")>=0||B.id==="pet_portrait_hand",add:" A proper portrait, on the back of my hand.",addPlaced:" A proper portrait.",
    test:(a)=>a.style==="realism"&&/^hand/.test(a.placement||""),
    make:(a,r)=>{a.style="realism";a.placement=r.chance(0.5)?"hand_l":"hand_r";a.sizeMm=r.int(45,65);},
    fix:a=>{a.placement=a.placement==="hand_l"?"forearm_l":"forearm_r";a.sizeMm=Math.max(80,a.sizeMm);},
    gentle:"A portrait needs room and fine shading. Hands shed skin fast and that detail goes soft in a year or two. The forearm would hold it far better.",
    blunt:"A portrait on a hand won't look like anyone in two years. Hands eat fine detail. Forearm, or it's a waste of your money.",
    yes:"The forearm. Fine. I'll still see it every day.",no:"It has to be the hand. I'll go somewhere else.",insist:"I want it on the hand. I'll come back for touch-ups."},
  {id:"fine_hand",fits:B=>B.styles.indexOf("fineline")>=0&&(B.size==="tiny"||B.size==="small"),add:" Fine line, super delicate, on my {placename}.",addPlaced:" Fine line, super delicate.",
    test:(a)=>a.style==="fineline"&&/^(hand|foot)/.test(a.placement||""),
    make:(a,r)=>{a.style="fineline";a.placement=r.pick(["hand_l","hand_r","foot_l","foot_r"]);a.sizeMm=r.int(15,35);},
    fix:a=>{a.placement=/_l$/.test(a.placement)?"forearm_l":"forearm_r";},
    gentle:"Fine line on a {placename} tends to break up and blur within a couple of years. Same design on the forearm would stay crisp. What do you think?",
    blunt:"Fine line on a {placename} falls apart. You'll be back in a year asking why it looks patchy. Put it on your forearm.",
    yes:"Forearm it is. I don't want it falling apart.",no:"I came for the {placename}. Never mind.",insist:"I know. I still want it there."},
  {id:"watercolour_sun",fits:B=>B.styles.indexOf("watercolour")>=0&&B.size!=="huge",add:" Soft watercolour, no outlines.",
    test:(a,c,P)=>a.style==="watercolour"&&(/^(hand|foot)/.test(a.placement||"")||((c.traits&&c.traits.sun)||0)>=0.7&&P&&P.sun>=0.6),
    make:(a,r)=>{a.style="watercolour";a.placement=r.pick(["hand_l","hand_r","foot_l","foot_r"]);},
    fix:a=>{a.placement=/_l$/.test(a.placement||"")?"upperarm_l":"upperarm_r";a.outline=true;},
    gentle:"Watercolour without outlines fades fast in the sun. Could we give it a soft black outline and put it somewhere it gets less light?",
    blunt:"With no outline, out in the sun like that, it'll be a faint stain in five years. It needs an outline and a shadier spot.",
    yes:"An outline's fine if it keeps it there.",no:"No outlines, that's the look. I'll try elsewhere.",insist:"No outlines. I'll keep it out of the sun. Mostly."},
  {id:"cover_job",fits:B=>B.size==="tiny"||B.size==="small",add:" On my {placename}, where everyone can see it.",addPlaced:" Where everyone can see it.",
    test:(a,c,P)=>P&&P.visibility>=0.9&&(c.cover||0)>=0.6,
    make:(a,r)=>{a.placement=r.pick(["neck_l","neck_r","hand_l","hand_r"]);},
    fix:a=>{a.placement=/_l$/.test(a.placement||"")?"upperarm_l":"upperarm_r";},
    gentle:"You said you work as a {job}. The {placename} is hard to hide at work. Somewhere a shirt covers would keep you out of trouble.",
    blunt:"With your job, a piece on the {placename} is a conversation with your boss you don't want. Somewhere you can cover.",
    yes:"You're right. My manager would have a stroke. Somewhere I can cover.",no:"It's my body and my job's my problem. Forget it.",insist:"My job can deal with it."},
  {id:"ribs_low_pain",fits:B=>B.size!=="tiny",add:" On my ribs.",addPlaced:"",
    test:(a,c)=>/^ribs/.test(a.placement||"")&&((c.traits&&c.traits.pain)||0.5)<0.3,
    make:(a,r)=>{a.placement=r.chance(0.5)?"ribs_l":"ribs_r";},
    fix:a=>{a.placement=/_l$/.test(a.placement||"")?"thigh_l":"thigh_r";},
    gentle:"Ribs are the hardest spot there is, and you said needles scare you. The thigh is far kinder and still easy to hide.",
    blunt:"You'll tap out on the ribs halfway through and walk around with half a tattoo. Do the thigh.",
    yes:"The thigh. Yes. Please.",no:"Ribs or nothing. I'll go somewhere else.",insist:"I'll manage. I want the ribs."}
];

/* ---- the consult: questions. reveal = what it can uncover; p = base + skill x consult level + trust x trusting +
   talk x talkative (clamped to [0.05, 0.97]). text = the artist's line ---- */
const CONSULT_QUESTIONS=[
  {id:"q_story",reveal:"must",text:"What's the story behind it?",base:0.35,skill:0.04,trust:0.15,talk:0.25},
  {id:"q_must",reveal:"must",text:"Is there anything it absolutely has to have?",base:0.45,skill:0.04,trust:0.2,talk:0.05},
  {id:"q_avoid",reveal:"deal",text:"Anything you'd hate to see in it?",base:0.45,skill:0.04,trust:0.2,talk:0.1},
  {id:"q_colour",reveal:"colour",text:"Colour, or black and grey?",base:0.75,skill:0.02,trust:0.1,talk:0.05},
  {id:"q_size",reveal:"size",text:"How big are you picturing? Show me with your hands.",base:0.7,skill:0.02,trust:0.1,talk:0.1},
  {id:"q_work",reveal:"cover",text:"What do you do for work? Do you need to cover it?",base:0.7,skill:0.02,trust:0.1,talk:0.1},
  {id:"q_pain",reveal:"pain",text:"Have you sat for a tattoo before? How are you with needles?",base:0.6,skill:0.03,trust:0.15,talk:0.1},
  {id:"q_sun",reveal:"sun",text:"Are you out in the sun much? Summers at the dacha?",base:0.65,skill:0.02,trust:0.05,talk:0.15},
  {id:"q_budget",reveal:"budget",text:"Have you got a budget in mind?",base:0.5,skill:0.03,trust:0.25,talk:0.05},
  {id:"q_aftercare",reveal:"aftercare",text:"Can you keep it out of the banya and the sun for two weeks?",base:0.55,skill:0.03,trust:0.2,talk:0.05},
  {id:"q_style",reveal:"style",text:"Show me a few tattoos you've liked on other people.",base:0.55,skill:0.03,trust:0.1,talk:0.15}
];
/* how the client answers. value lines by band (0..1 split into low/mid/high), or the must/deal say lines */
const CONSULT_ANSWERS={
  vague:["Hm. I don't know. Whatever you think.","I haven't really thought about it.","You're the artist.","Let me think about that one.","No idea, honestly."],
  noneMust:["No, nothing it has to have. I trust you.","Not really. Just make it good."],
  noneDeal:["Honestly, I'm easy. Nothing I'd hate.","No, nothing comes to mind. Surprise me, within reason."],
  colour:{low:"Black and grey. Colour's not me.",mid:"A little colour, maybe. Not a rainbow.",high:"Colour! Lots of it."},
  size:{low:"Small. Like this. Smaller than a matchbox.",mid:"About the size of my palm?",high:"Big. I want people to see it from the tram."},
  cover:{low:"I'm a {job}. Nobody cares what's on my arms.",mid:"I'm a {job}. Sleeves cover most things.",high:"I'm a {job}. It has to be hidden at work, always."},
  pain:{low:"I fainted at my last blood test. Is that bad?",mid:"I'll be fine. Probably. Have you got biscuits?",high:"I sat four hours for my last one and fell asleep."},
  sun:{low:"Sun? I live under fluorescent lights.",mid:"Weekends outside, in summer.",high:"I'm outdoors all day, every day."},
  budget:{low:"Not much, honestly. Is that a problem?",mid:"I've put something aside. Within reason.",high:"Don't worry about money. Worry about making it good."},
  aftercare:{low:"Two weeks? The banya is my whole social life.",mid:"I'll try. I'm not great with creams.",high:"I'll follow every instruction. I'll write them down."},
  style:"I keep saving {style} pieces. That's what I like, I think."
};
/* consult structure */
const CONSULT={
  exchanges:[3,5],           // a consult is 3..5 exchanges: 3 + up to 2 more for talkative clients; the last is always the quote
  questionsShown:3,          // questions offered per exchange (2 when there is a bad idea to talk about)
  moodStart:0.5,moodAnswer:0.04,moodVague:-0.01,moodPushy:-0.06,quietTalk:0.3,quietMax:2,
  talkGentle:{base:0.35,trust:0.45,skill:0.03,walk:0.4,respect:0.1},   // success chance and, on failure, chance they walk
  talkBlunt:{base:0.25,trust:0.35,skill:0.04,walk:0.6,respect:0.16},
  declineLoyal:0.02          // turning a job down honestly
};
/* the quote. rate per stage is a share of RATE_DEFAULT (S.rate wins once PR 7 sets it, already in today's rubles).
   wtpLo/Hi = what a client will pay per hour in 2000 rubles at budget 0..1. acceptance falls off with price / wtp and
   with the wait for a chair; collectors and loyal clients wait longer */
const QUOTE={
  stageRate:{apprentice:0.45,chair:1,studio:1.3,legacy:1.8},
  deposit:0.2,depositMin:300,depositMax:0.5,round:100,   // depositMin is in 2000 rubles (x priceIndex); never more than depositMax of the price
  wtpLo:450,wtpHi:1700,wtpLoyal:0.3,
  acceptAt1:0.78,acceptSlope:1.4,acceptMin:0.03,acceptMax:0.97,moodK:0.4,
  waitOk:4,waitOkLoyal:20,waitOkCollector:60,waitHit:0.015,
  options:{q_fair:{mult:1,text:"Quote a fair price",loyal:0},q_high:{mult:1.3,text:"Quote high",loyal:-0.04},q_low:{mult:0.8,text:"Mate's rate",loyal:0.05}},
  touchupFreeWeeks:52,touchupMult:0.4
};
/* loyalty deltas (gains scale with the loyalty trait: x lerp(lo, hi, trait)) */
const LOYALTY={
  start:0.15,startTrait:0.2,gainLo:0.6,gainHi:1.4,
  accepted:0.05,walked:-0.03,talkedWon:0.12,talkedLost:-0.06,insisted:-0.02,declined:0.02,quoteHigh:-0.04,quoteLow:0.05,
  piece:0.08,return:0.04,crisp:0.1,soft:0.03,patchy:-0.08,blownout:-0.18,infected:-0.25,review:0,noShow:-0.03,referral:0.03
};
/* reviews: [stars, text] by heal grade x loyalty band (low < 0.35 <= mid < 0.7 <= high). {label} {place} */
const REVIEW_BANDS=[0.35,0.7];
const REVIEW_CHANCE={crisp:0.35,soft:0.2,patchy:0.3,blownout:0.55,infected:0.8};
const REVIEWS={
  crisp:{
    low:[[4,"Clean lines, healed well. Bit pricey."],[4,"Did a good job on my {label}. In and out."]],
    mid:[[5,"My {label} healed perfectly. Already planning the next one."],[5,"Calm, careful, and the lines are razor sharp. Recommend."]],
    high:[[5,"I'd trust this shop with my whole body. The {label} on my {place} is the best thing I own."],[5,"Third visit, still the best in Mostograd. The heal is flawless."]]},
  soft:{
    low:[[3,"It's fine. Softer than I expected once it healed."],[3,"OK work. A couple of lines went a bit fuzzy."]],
    mid:[[4,"Healed a little soft in places but I love it."],[4,"Lovely to work with. The {label} settled in nicely."]],
    high:[[5,"A line or two healed soft and they're already booking me a free touch-up. That's why I come back."],[4,"Not perfect, but it's mine and I'd come back tomorrow."]]},
  patchy:{
    low:[[2,"Healed patchy. Disappointed."],[2,"Paid full price for a {label} that looks half done."]],
    mid:[[3,"The heal came out patchy, but they offered to fix it. We'll see."],[3,"Nice design. The colour didn't stay everywhere."]],
    high:[[4,"Patchy heal, partly my fault, I went to the banya. They're fixing it."],[4,"Some spots fell out. Still coming back. Good people."]]},
  blownout:{
    low:[[1,"The lines blew out and my {label} looks like it's bleeding through paper. Avoid."],[1,"Lines spread everywhere. Never again."]],
    mid:[[2,"Some lines blew out. They were honest about it, at least."],[2,"Blurry in places after it healed. Talked to them about a fix."]],
    high:[[3,"A few lines blew out. It happens. They're making it right and I trust them."],[3,"Rough heal, but I've had six good ones here."]]},
  infected:{
    low:[[1,"Got infected. Doctor, antibiotics, the lot. Stay away."],[1,"Infection. That's all I'll say."]],
    mid:[[2,"It got infected, and they handled it well, but still."],[2,"Infection after two weeks. They fixed it for free."]],
    high:[[3,"It got infected, I'll admit I skipped the cream. They looked after me. Still my shop."],[3,"Bad week with an infection. The apology was real. I'll be back."]]}
};
/* pieces a client got somewhere else (for cover-ups of someone else's work) */
const FOREIGN_PIECES=[
  {label:"faded name",tags:["script"],where:"at a place by the station"},
  {label:"barbed-wire band",tags:["band"],where:"at a booth on the outer ring",from:2000},
  {label:"blurry star",tags:["star"],where:"from a friend with a sewing needle"},
  {label:"wobbly heart with initials",tags:["love"],where:"on holiday down south"},
  {label:"blown-out swallow",tags:["bird"],where:"at a shop that closed years ago"},
  {label:"green-grey anchor",tags:["nautical"],where:"from a man on a ship who swore he knew what he was doing"},
  {label:"cartoon dolphin",tags:["ocean"],where:"on a dare after a wedding"}
];
/* returns. after = [from, to] weeks since the piece (or since the last visit for "other"); p = chance over that window
   at loyalty 0 .. 1 (spread evenly as a weekly chance); needs = what the piece must be; brief = client lines with
   {label} {place} {year} {foreign} {where}. reckoning: PR 8 may turn this return into a scripted beat (SIM.onReturn) */
const RETURN_RULES=[
  {id:"touchup",after:[6,60],p:[0.04,0.18],needs:{},size:"tiny",ask:"same",
    brief:["The {label} on my {place} from {year} has a couple of light spots. Can I come in for a touch-up?",
      "Hi, it's me again. You did the {label} on my {place} in {year}. One line healed thin. Could you have a look?"]},
  {id:"addon",after:[20,200],p:[0.05,0.4],needs:{},size:"small",ask:"near",
    brief:["I keep looking at the {label} you did on my {place} in {year}. I want something next to it. It looks lonely.",
      "Remember the {label} on my {place}? {year}. I want to add to it. Same hand, same feel."]},
  {id:"sleeve",after:[40,520],p:[0.02,0.25],needs:{region:["arm","leg"]},size:"huge",ask:"grow",
    brief:["You did the {label} on my {place} in {year}. I want a full sleeve now, built around it. Don't touch it, it's my favourite.",
      "It's time. The {label} from {year} on my {place} needs company. Let's do the whole limb, and keep that one in the middle."]},
  {id:"cover_own",after:[260,1040],p:[0.01,0.08],needs:{early:3},size:"medium",ask:"cover",reckoning:true,
    brief:["The {label} you did on my {place} back in {year}... it's gone soft. Can you cover it, or rework it?",
      "I still like you, I promise. But the {label} on my {place} from {year} has seen better days. Can we fix it?"]},
  {id:"cover_other",after:[26,400],p:[0.01,0.1],needs:{},size:"medium",ask:"cover",foreign:true,
    brief:["I had a {foreign} done on my {place} {where} in {year}. You've done my other work. Can you cover it?",
      "Confession: there's a {foreign} on my {place}, from {year}, {where}. I want you to make it disappear."]}
];
/* word of mouth: a piece that healed REFERRAL.after weeks ago may send a friend (chance by loyalty) */
const REFERRAL={after:4,chance:[0.02,0.3],
  lines:["{name} sent me. {Pr} won't stop showing everyone {pos} {label}.","My friend {name} said you're the only one in Mostograd worth the wait.",
    "{name} told me to ask for you specifically.","I saw {name}'s {label} at a birthday and I had to know who did it."]};

/* ===== generation ===== */
function clPick(r,list){return list[Math.floor(r()*list.length)];}
function clTrait(r,k,shift){const t=CLIENT_TRAITS[k];return clamp(r.normal(t.mean+(shift||0),t.sd),CLIENT_TRAITS.lo,CLIENT_TRAITS.hi);}
const clR2=v=>Math.round(v*100)/100;
/* an adult age from AGE_BANDS, inside [lo, hi] when a brief asks for it (never under 18) */
function clAge(r,range){
  const lo=Math.max(18,range?range[0]:18),hi=Math.min(75,range?range[1]:75);
  const bands=AGE_BANDS.map(b=>[Math.max(b[0],lo),Math.min(b[1],hi),b[2]*Math.max(0,Math.min(b[1],hi)-Math.max(b[0],lo)+1)/(b[1]-b[0]+1)]).filter(b=>b[2]>0);
  const b=bands.length?r.weighted(bands,x=>x[2]):[lo,Math.max(lo,hi)];
  return Math.max(18,r.int(b[0],b[1]));
}
function clName(r,pronouns){
  const g=r.weighted(NAMES.groups,x=>x.w),src=g.from?NAMES.groups.find(x=>x.id===g.from):g;
  let first;
  if(pronouns==="they/them")first=clPick(r,(src.they&&src.they.length?src.they:NAMES.neutral));
  else first=clPick(r,pronouns==="he/him"?src.he:src.she);
  let sur=g.surnames,last;
  if(pronouns==="they/them"){const ind=sur.filter(s=>typeof s==="string");last=ind.length?clPick(r,ind):clPick(r,sur)[0];}
  else{const s=clPick(r,sur);last=typeof s==="string"?s:s[pronouns==="he/him"?0:1];}
  let patronymic=null;
  if(g.patronymic&&pronouns!=="they/them"){const p=clPick(r,NAMES.patronymics);patronymic=p[pronouns==="he/him"?0:1];}
  return{first,last,patronymic,group:g.id,tone:g.tone};
}
function clJob(r,age,year,want){
  if(want){const names=Array.isArray(want)?want:[want],js=JOBS.filter(j=>names.indexOf(j.name)>=0);if(js.length)return clPick(r,js);}
  const ok=JOBS.filter(j=>{const a=j.ages||JOB_AGES;return(!j.from||year>=j.from)&&(!j.to||year<=j.to)&&age>=a[0]&&age<=a[1];});
  return r.weighted(ok.length?ok:JOBS,j=>j.w);
}
/* a placement id from a brief's place entry ("forearm" -> forearm_l / forearm_r) */
function clPlace(r,base){const P=SIM.PLACEMENTS||{};if(P[base])return base;const s=r.chance(0.5)?"_l":"_r";return P[base+s]?base+s:(P[base+"_l"]?base+"_l":"forearm_r");}
/* how a client says a placement after "my" (and how a piece name says it after "Darya's") */
const PLACE_WORDS={neck_l:"neck, left side",neck_r:"neck, right side",chest_l:"chest, left side",chest_r:"chest, right side"};
function clPlaceName(id){if(PLACE_WORDS[id])return PLACE_WORDS[id];const p=(SIM.PLACEMENTS||{})[id];return p?p.name:"arm";}
function clSlotFill(text,ctx){
  return text.replace(/\{(\w+)\}/g,(m,k)=>{
    if(ctx[k]!=null)return String(ctx[k]);
    const lk=k.charAt(0).toLowerCase()+k.slice(1);
    if(ctx[lk]!=null){const v=String(ctx[lk]);return v.charAt(0).toUpperCase()+v.slice(1);}
    return m;});
}
/* style demand this year (STYLES[*].demandCurve, piecewise linear) */
function styleDemand(styleId,year){
  const tm=typeof SIM.trendMult==="function"?SIM.trendMult(styleId,year):1;   // PR 8's trend wave, when it exists
  const st=(SIM.STYLES||{})[styleId],c=st&&st.demandCurve;if(!c||!c.length)return tm;
  if(year<=c[0][0])return c[0][1]*tm;
  for(let i=1;i<c.length;i++)if(year<=c[i][0]){const a=c[i-1],b=c[i];return lerp(a[1],b[1],(year-a[0])/((b[0]-a[0])||1))*tm;}
  return c[c.length-1][1]*tm;
}
/* the brief and its style: weighted by the demand for the brief's styles, the segment boosts and the size the stage allows */
function clChooseBrief(r,opts){
  const year=opts.year,boost=opts.segBoost||{},sizes=opts.sizes||null,sm=opts.styleMult||null;
  const sd=s=>styleDemand(s,year)*(sm&&sm[s]||1);   // PR 7: a guest spot's or a staff artist's style pull
  const segW=list=>{let m=1;for(const s of list||[])m+=boost[s]||0;return m;};
  const ok=BRIEFS.filter(b=>(!b.from||year>=b.from)&&(!b.to||year<=b.to)&&(!sizes||sizes.indexOf(b.size)>=0)&&(!opts.theme||b.theme===opts.theme)&&(!opts.style||b.styles.indexOf(opts.style)>=0));
  const pool=ok.length?ok:BRIEFS;
  const b=r.weighted(pool,x=>{let d=0;for(const s of x.styles)d+=sd(s);return d/x.styles.length*segW(x.seg)*(x.w||1);});
  const style=opts.style&&b.styles.indexOf(opts.style)>=0?opts.style:r.weighted(b.styles,s=>sd(s)*segW(((SIM.STYLES||{})[s]||{}).clientSegments)*(s===b.styles[0]?1.3:1));
  return{b,style};
}
/* id: the next free "c<n>" given S (scans S.clients, the newcomers waiting in the queue, and `taken`) */
function clNextId(S,taken){
  let mx=0;
  const see=id=>{const m=/^c(\d+)$/.exec(id||"");if(m)mx=Math.max(mx,+m[1]);};
  for(const c of S.clients||[])see(c.id);
  for(const q of S.queue||[])if(q.newClient)see(q.newClient.id);
  if(taken)for(const id of taken)see(id);
  return "c"+(mx+1);
}

/* makeClient(r, opts): opts = {id, year, week, stage, segBoost:{segment:+weight}, sizes:[SIZE_CLASSES ids],
   theme, style, briefId, referredBy: client, src:"walkin"|"referral"|"return"|"test", badIdea: true|false|undefined} */
function makeClient(r,opts){
  opts=opts||{};
  const year=opts.year||2000,week=opts.week||1;
  const pronouns=r.weighted(PRONOUNS,x=>x[1])[0];
  /* the brief first: it can ask for an age range and a job */
  const pick=opts.briefId?{b:BRIEFS.find(x=>x.id===opts.briefId)||BRIEFS[0],style:null}:clChooseBrief(r,{year,segBoost:opts.segBoost,sizes:opts.sizes,theme:opts.theme,style:opts.style,styleMult:opts.styleMult});
  const B=pick.b,style=pick.style||opts.style||B.styles[0];
  const age=clAge(r,B.ages);
  const nm=clName(r,pronouns);
  const job=clJob(r,age,year,B.job);
  const bodyShape=(()=>{const m=BODY_BY_PRONOUN[pronouns];return r.weighted(Object.keys(m),k=>m[k]);})();
  const skinTone=clR2(r.range(nm.tone[0],nm.tone[1]));
  const T=CLIENT_TRAITS;
  const traits={
    pain:clR2(clTrait(r,"pain")),
    sun:clR2(clamp(lerp(clTrait(r,"sun"),job.sun,T.sun.job),T.lo,T.hi)),
    aftercare:clR2(clTrait(r,"aftercare",T.aftercare.age*(age-30))),
    budget:clR2(clamp(lerp(clTrait(r,"budget"),job.pay,T.budget.job),T.lo,T.hi)),
    loyalty:clR2(clTrait(r,"loyalty",T.loyalty.age*(age-30))),
    talkative:clR2(clTrait(r,"talkative")),
    trusting:clR2(clTrait(r,"trusting"))
  };
  /* where and how big */
  const placement=clPlace(r,clPick(r,B.place));
  const sz=SIZE_CLASSES[B.size]||SIZE_CLASSES.small;
  const ask={placement,sizeMm:r.int(sz[0],sz[1]),style,tags:B.tags.slice(),theme:B.theme,size:B.size,bad:null};
  /* one in BAD_IDEA_CHANCE walk-ins (and some briefs on their own) arrive with something to talk them out of. The bad
     idea is applied before the brief is written, so {place} names where they now want it */
  const cover=job.cover,proto={traits,cover,job:job.name};
  let badAdd="";
  if(opts.badIdea===true||(opts.badIdea!==false&&r.chance(BAD_IDEA_CHANCE))){
    const cands=BAD_IDEAS.filter(b=>b.fits(B)&&(b.id!=="cover_job"||cover>=0.6)&&(b.id!=="ribs_low_pain"||traits.pain<0.3));
    if(cands.length){const bi=clPick(r,cands);bi.make(ask,r);badAdd=/\{place\}/i.test(B.text)&&bi.addPlaced!=null?bi.addPlaced:bi.add;}
  }
  const ctx={};
  const person=clPick(r,BRIEF_SLOTS.person);ctx.person=person.t;
  const pw=PRONOUN_WORDS[person.p==="he"?"he/him":person.p==="they"?"they/them":"she/her"];
  ctx.pr=pw.pr;ctx.pos=pw.pos;
  for(const k of ["loved","habit","flower","petName","workplace","partner"]){
    if(B.text.indexOf("{"+k)<0)continue;const v=clPick(r,BRIEF_SLOTS[k]);ctx[k]=v.t;if(v.tags)for(const t of v.tags)if(ask.tags.indexOf(t)<0)ask.tags.push(t);}
  ctx.place=clPlaceName(ask.placement);
  ctx.pastYear=String(Math.min(year-1,Math.max(year-age+18,year-r.int(1,8))));   // a year they were already an adult
  ctx.mm=ask.sizeMm;ctx.placename=ctx.place;
  let brief=clSlotFill(B.text+badAdd,ctx);
  for(const bi of BAD_IDEAS)if(bi.test(ask,proto,(SIM.PLACEMENTS||{})[ask.placement])){ask.bad=bi.id;break;}
  /* wants */
  const styles={};styles[style]=1;
  const st=(SIM.STYLES||{})[style],blends=(st&&st.blendsWith)||[];
  const nSec=r.int(1,2);for(let i=0;i<nSec&&blends.length;i++){const s=clPick(r,blends);if(!styles[s])styles[s]=clR2(r.range(0.35,0.75));}
  const wsz=[Math.max(8,Math.round(sz[0]*r.range(0.7,0.95))),Math.round(sz[1]*r.range(1.05,1.5))];
  const colour=clR2(clamp((STYLE_COLOUR[style]!=null?STYLE_COLOUR[style]:0.4)+r.normal(0,0.15),0,1));
  const wants={styles,tags:ask.tags.slice(0,4),sizeMm:wsz,colour};
  /* must-haves and dealbreakers: stated in the brief (known) and hidden */
  const mustHaves=[],dealbreakers=[];
  const known={styles:[style],tags:true,size:false,colour:false,pain:false,sun:false,cover:false,budget:false,aftercare:false,
    mustHaves:[],dealbreakers:[],mustAll:false,dealAll:false};
  const sameKV=(a,b)=>a.kind===b.kind&&a.v===b.v;
  for(const m of (B.known&&B.known.must)||[]){mustHaves.push({kind:m.kind,v:m.v});known.mustHaves.push({kind:m.kind,v:m.v});}
  for(const d of (B.known&&B.known.deal)||[]){dealbreakers.push({kind:d.kind,v:d.v});known.dealbreakers.push({kind:d.kind,v:d.v});}
  if(r.chance(HIDDEN_WANTS.mustChance)){
    const pal=(st&&st.palette)||[];
    const pool=HIDDEN_WANTS.must.filter(m=>m.themes.indexOf(B.theme)>=0&&!mustHaves.some(x=>sameKV(x,m))&&!dealbreakers.some(x=>sameKV(x,m))&&
      (m.kind!=="style"||B.styles.indexOf(m.v)>=0)&&(m.kind!=="colour"||pal.indexOf(m.v)>=0));
    if(pool.length){const m=clPick(r,pool);mustHaves.push({kind:m.kind,v:m.v});}
  }
  if(r.chance(HIDDEN_WANTS.dealChance)){
    const pool=HIDDEN_WANTS.deal.filter(d=>!dealbreakers.some(x=>sameKV(x,d))&&!(d.kind==="style"&&styles[d.v])&&!(d.kind==="tag"&&ask.tags.indexOf(d.v)>=0)&&!mustHaves.some(x=>x.kind===d.kind&&x.v===d.v));
    if(pool.length){const d=clPick(r,pool);dealbreakers.push({kind:d.kind,v:d.v});}
  }
  if(/small|tiny/i.test(brief))known.size=true;
  const rb=opts.referredBy||null;
  if(rb){
    const rp=PRONOUN_WORDS[rb.pronouns]||PRONOUN_WORDS["they/them"];
    const lp=opts.referrerLabel||"tattoo";
    brief=clSlotFill(clPick(r,REFERRAL.lines),{name:rb.first||rb.name,pr:rp.pr,pos:rp.pos,label:lp})+" "+brief;
  }
  const loyaltyStart=clR2(LOYALTY.start+LOYALTY.startTrait*traits.loyalty+(rb?LOYALTY.referral:0));
  return{
    id:opts.id||"c1",name:nm.first+" "+nm.last,first:nm.first,surname:nm.last,patronymic:nm.patronymic,
    addr:age>=FORMAL_AGE&&nm.patronymic?nm.first+" "+nm.patronymic:nm.first,
    pronouns,age,born:year-age,bodyShape,skinTone,job:job.name,cover:job.cover,
    traits,wants,mustHaves,dealbreakers,known,
    brief,ask,theme:B.theme,briefId:B.id,firstTattoo:!!B.first,
    loyalty:loyaltyStart,referredBy:rb?rb.id:null,src:opts.src||"walkin",
    since:{w:week,y:year},lastSeen:{w:week,y:year},visits:0,pieces:[],history:[]
  };
}
const clientAge=(c,year)=>c.born!=null?year-c.born:c.age;

/* ===== memory ===== */
function clientLog(client,entry){if(!client.history)client.history=[];client.history.push(entry);if(entry.w&&entry.y)client.lastSeen={w:entry.w,y:entry.y};return entry;}
function loyaltyBump(client,kind,scale){
  const d=(typeof kind==="number"?kind:LOYALTY[kind]||0)*(scale==null?1:scale);
  const t=(client.traits&&client.traits.loyalty!=null)?client.traits.loyalty:0.5;
  const m=d>0?lerp(LOYALTY.gainLo,LOYALTY.gainHi,t):1;
  client.loyalty=clR2(clamp((client.loyalty||0)+d*m,0,1));
  return client.loyalty;
}
const clBand=l=>l<REVIEW_BANDS[0]?"low":l<REVIEW_BANDS[1]?"mid":"high";
/* writeReview(client, piece, r) -> {stars, text} or null (most people don't write one). Logs it. */
function writeReview(client,piece,r,force){
  const g=piece.heal&&REVIEWS[piece.heal]?piece.heal:"soft";
  if(!force&&!r.chance(REVIEW_CHANCE[g]||0.2))return null;
  const row=clPick(r,REVIEWS[g][clBand(client.loyalty||0)]);
  const text=clSlotFill(row[1],{label:piece.label||"tattoo",place:clPlaceName(piece.design&&piece.design.placement)});
  return clientLog(client,{w:piece.healW||piece.w,y:piece.healY||piece.y,kind:"review",piece:piece.id,stars:row[0],text});
}
/* findClient(S, id): a Map index cached per clients array, rebuilt when the array grows or an entry is replaced */
const clIdxCache=new WeakMap();
function findClient(S,id){
  const arr=S.clients||[];let e=clIdxCache.get(arr);
  const hit=e&&e.n===arr.length?e.m.get(id):null;
  if(hit&&arr[hit.i]===hit.c)return hit.c;
  e={n:arr.length,m:new Map()};arr.forEach((c,i)=>e.m.set(c.id,{c,i}));clIdxCache.set(arr,e);
  const h=e.m.get(id);return h?h.c:null;
}

/* ===== pieces ===== */
/* the label a piece is known by: its biggest motif ("rose"); lettering reads as the word ("Hope" script) */
function pieceLabel(design){
  let best=null,bs=-1;
  for(const e of (design&&design.elements)||[]){
    const el=SIM.elementById?SIM.elementById(e.id):null;if(!el)continue;
    const w=(e.scale||0.5)*(el.family==="fill"||el.family==="texture"||el.family==="frame"?0.3:1);
    if(w>bs){bs=w;best=el;}
  }
  if(!best)return "tattoo";
  const m=/^Script: (.+)$/.exec(best.name);if(m)return "\""+m[1]+"\" script";
  return best.name.charAt(0).toLowerCase()+best.name.slice(1);
}
function pieceName(label,client,placement){return "the "+label+" on "+((client&&client.first)||"a client")+"'s "+clPlaceName(placement);}
/* addPiece(S, {client, design, out, heal, price, item}) -> piece. Pieces are never dropped (ids p1, p2, ...). */
function addPiece(S,o){
  const c=typeof o.client==="object"?o.client:findClient(S,o.client);
  const design=o.design||{};
  const label=pieceLabel(design);
  const piece={id:"p"+(S.pieces.length+1),client:c?c.id:o.client,design,out:o.out||null,heal:o.heal||null,w:S.week,y:S.year,
    name:pieceName(label,c,design.placement),label,stage:(S.studio&&S.studio.stage)||"apprentice",price:o.price||0};
  if(o.ret)piece.ret=o.ret;
  S.pieces.push(piece);
  if(c){
    if(!c.pieces)c.pieces=[];c.pieces.push(piece.id);c.visits=(c.visits||0)+1;
    clientLog(c,{w:S.week,y:S.year,kind:"piece",piece:piece.id,name:piece.name});
    loyaltyBump(c,"piece");
  }
  return piece;
}

/* ===== the consult =====
   consult = {client, step, max, stage:"talk"|"quote"|"done", transcript:[{who:"client"|"artist"|"note", text}],
     known (a copy of client.known that grows), ask (a copy that the talk-out may change), asked:[question ids], mood,
     bad: BAD_IDEAS id or null, talk: null|"won"|"lost"|"insisted", quote: null|{...}, outcome: null|"accepted"|"walked"|"declined",
     skill, year, week, rate, wait, src, item } */
function clCopy(o){return JSON.parse(JSON.stringify(o));}
function clRate(S){
  if(S.rate>0)return S.rate;
  const st=(S.studio&&S.studio.stage)||"apprentice";
  return RATE_DEFAULT.rate*(QUOTE.stageRate[st]||1)*SIM.priceIndex(S.year);
}
/* a one-element stand-in for the ask, so scoreDesign can estimate hours and sessions before the board exists */
function clProxyDesign(ask){
  const E=SIM.ELEMENTS||[];
  let best=null,bs=-1;
  for(const e of E){
    if(e.family==="fill"||e.family==="texture"||e.family==="frame")continue;
    let s=0;for(const t of ask.tags||[])if(e.tags.indexOf(t)>=0)s+=2;
    if(e.styles.indexOf(ask.style)>=0)s+=1.5;
    if(s>bs){bs=s;best=e;}
  }
  const st=(SIM.STYLES||{})[ask.style],lr=(st&&st.lineRange)||[5,9];
  const rl=LINE_WEIGHTS.reduce((a,b)=>Math.abs(b-(lr[0]+lr[1])/2)<Math.abs(a-(lr[0]+lr[1])/2)?b:a);
  return{placement:ask.placement,sizeMm:ask.sizeMm,style:ask.style,elements:best?[{id:best.id,x:0.5,y:0.5,scale:1,rot:0,lineWeight:rl,fill:0.5,colour:null}]:[]};
}
function clEstimate(ask,client,skills){
  const sc=scoreDesign(clProxyDesign(ask),client,skills||{},{year:2000});
  return{hours:sc.hours,sessions:sc.sessions};
}
/* consultStart(client, S, opts): opts.item = the queue item the client came in on (its brief/ask/ret win) */
function consultStart(client,S,opts){
  opts=opts||{};
  const item=opts.item||null;
  const ask=clCopy((item&&item.ask)||client.ask||{placement:"forearm_r",sizeMm:60,style:"traditional",tags:[]});
  const brief=(item&&item.brief)||client.brief||"";
  const P=(SIM.PLACEMENTS||{})[ask.placement];
  let bad=ask.bad||null;
  if(bad==null)for(const b of BAD_IDEAS)if(b.test(ask,client,P)){bad=b.id;break;}
  const tk=(client.traits&&client.traits.talkative)||0.5;
  const max=clamp(CONSULT.exchanges[0]+(tk>0.66?2:tk>0.33?1:0),CONSULT.exchanges[0],CONSULT.exchanges[1]);
  const skills=S.skills||{};
  const est=clEstimate(ask,client,skills);
  const c={client,clientId:client.id,step:0,max,stage:"talk",transcript:[{who:"client",text:brief}],
    known:clCopy(client.known||{}),ask,asked:[],mood:CONSULT.moodStart,bad,talk:null,quote:null,outcome:null,
    skill:clamp(skills.consult||0,0,10),year:S.year,week:S.week,rate:Math.round(clRate(S)),wait:waitWeeks(S),
    shopStage:(S.studio&&S.studio.stage)||"apprentice",est,src:(item&&item.src)||client.src||"walkin",item:item?item.id:null,ret:(item&&item.ret)||null};
  c.transcript.push({who:"note",text:clientAge(client,S.year)+" years old · "+client.pronouns+" · "+(client.patronymic&&clientAge(client,S.year)>=FORMAL_AGE?"call them "+client.addr:"goes by "+client.first)});
  return c;
}
/* options: questions not asked yet (a stable order per client and step, never sorted by what is hidden), the talk-out
   options while a bad idea is open, "talk price" from the second exchange; at the last exchange only the quote */
function consultOptions(c){
  if(!c||c.stage==="done")return[];
  if(c.stage==="quote"||c.step>=c.max-1){
    const o=QUOTE.options,out=[];
    for(const k of ["q_fair","q_high","q_low"])out.push({id:k,kind:"quote",text:o[k].text});
    out.push({id:"decline",kind:"quote",text:"Turn it down"});
    return out;
  }
  const out=[];
  const talkOpen=c.bad&&!c.talk;
  if(talkOpen){
    out.push({id:"talk_gentle",kind:"talk",text:"Suggest something that will last"});
    out.push({id:"talk_blunt",kind:"talk",text:"Tell them straight it won't hold up"});
  }
  const left=CONSULT_QUESTIONS.filter(q=>c.asked.indexOf(q.id)<0);
  const rr=rng(hash(c.clientId+":"+c.step+":"+c.year));
  const nq=talkOpen?CONSULT.questionsShown-1:CONSULT.questionsShown;
  for(const q of rr.shuffle(left).slice(0,nq))out.push({id:q.id,kind:"ask",text:q.text});
  if(c.step>=1)out.push({id:"to_quote",kind:"price",text:"Talk price"});
  return out.slice(0,5);
}
function clBandOf(v){return v<0.34?"low":v<0.67?"mid":"high";}
function clRevealLine(c,q,client){
  const t=client.traits||{},A=CONSULT_ANSWERS;
  const pw=PRONOUN_WORDS[client.pronouns]||PRONOUN_WORDS["they/them"];
  switch(q.reveal){
    case "must":{
      const hid=(client.mustHaves||[]).filter(m=>!c.known.mustHaves.some(k=>k.kind===m.kind&&k.v===m.v));
      if(!hid.length){c.known.mustAll=true;return null;}
      const m=hid[0];c.known.mustHaves.push({kind:m.kind,v:m.v});if(hid.length===1)c.known.mustAll=true;
      const row=HIDDEN_WANTS.must.find(x=>x.kind===m.kind&&x.v===m.v);
      return clSlotFill(row?row.say:"It has to have "+m.v+" in it.",{pos:pw.pos});}
    case "deal":{
      const hid=(client.dealbreakers||[]).filter(m=>!c.known.dealbreakers.some(k=>k.kind===m.kind&&k.v===m.v));
      if(!hid.length){c.known.dealAll=true;return null;}
      const m=hid[0];c.known.dealbreakers.push({kind:m.kind,v:m.v});if(hid.length===1)c.known.dealAll=true;
      const row=HIDDEN_WANTS.deal.find(x=>x.kind===m.kind&&x.v===m.v);
      return row?row.say:"No "+m.v+", please.";}
    case "colour":c.known.colour=true;return A.colour[clBandOf((client.wants&&client.wants.colour)||0)];
    case "size":{c.known.size=true;const s=(client.wants&&client.wants.sizeMm)||[40,90];return A.size[clBandOf(clamp((s[0]+s[1])/2/260,0,1))];}
    case "cover":c.known.cover=true;return clSlotFill(A.cover[clBandOf(client.cover||0)],{job:client.job});
    case "pain":c.known.pain=true;return A.pain[clBandOf(t.pain||0.5)];
    case "sun":c.known.sun=true;return A.sun[clBandOf(t.sun||0.4)];
    case "budget":c.known.budget=true;return A.budget[clBandOf(t.budget||0.5)];
    case "aftercare":c.known.aftercare=true;return A.aftercare[clBandOf(t.aftercare||0.5)];
    case "style":{
      const ws=(client.wants&&client.wants.styles)||{},next=Object.keys(ws).filter(s=>c.known.styles.indexOf(s)<0);
      if(!next.length)return null;c.known.styles.push(next[0]);
      const st=(SIM.STYLES||{})[next[0]];return clSlotFill(A.style,{style:st?st.name.toLowerCase():next[0]});}
  }
  return null;
}
function clArtistFill(text,c){
  const P=(SIM.PLACEMENTS||{})[c.ask.placement];
  return clSlotFill(text,{mm:c.ask.sizeMm,placename:P?P.name:"spot",job:c.client.job});
}
/* consultChoose(consult, choiceId, r) -> a new consult object */
function consultChoose(c0,choiceId,r){
  const c=Object.assign({},c0,{transcript:c0.transcript.slice(),known:clCopy(c0.known),ask:clCopy(c0.ask),asked:c0.asked.slice()});
  if(c.stage==="done")return c;
  const opts=consultOptions(c0),opt=opts.find(o=>o.id===choiceId);
  if(!opt)return c;
  const client=c.client,t=client.traits||{};
  c.step++;
  if(opt.kind==="ask"){
    const q=CONSULT_QUESTIONS.find(x=>x.id===choiceId);
    c.asked.push(q.id);c.transcript.push({who:"artist",text:q.text});
    const p=clamp(q.base+q.skill*c.skill+q.trust*(t.trusting||0.5)+q.talk*(t.talkative||0.5),0.05,0.97);
    let line=null;
    if(r.chance(p)){line=clRevealLine(c,q,client);
      if(line==null)line=q.reveal==="must"?clPick(r,CONSULT_ANSWERS.noneMust):q.reveal==="deal"?clPick(r,CONSULT_ANSWERS.noneDeal):clPick(r,CONSULT_ANSWERS.vague);
      c.mood+=CONSULT.moodAnswer;}
    else{line=clPick(r,CONSULT_ANSWERS.vague);c.mood+=CONSULT.moodVague;}
    if((t.talkative||0.5)<CONSULT.quietTalk&&c.asked.length>CONSULT.quietMax)c.mood+=CONSULT.moodPushy;
    c.transcript.push({who:"client",text:line});
  }else if(opt.kind==="talk"){
    const bi=BAD_IDEAS.find(b=>b.id===c.bad),T=choiceId==="talk_blunt"?CONSULT.talkBlunt:CONSULT.talkGentle;
    c.transcript.push({who:"artist",text:clArtistFill(choiceId==="talk_blunt"?bi.blunt:bi.gentle,c)});
    const p=clamp(T.base+T.trust*(t.trusting||0.5)+T.skill*c.skill+0.2*((client.loyalty||0)-0.2),0.05,0.95);
    if(r.chance(p)){
      bi.fix(c.ask);c.ask.bad=null;c.talk="won";c.respect=T.respect;c.mood+=0.08;
      c.transcript.push({who:"client",text:clArtistFill(bi.yes,c)});
      c.transcript.push({who:"note",text:"Changed to "+c.ask.sizeMm+" mm on the "+clPlaceName(c.ask.placement)+"."});
    }else if(r.chance(T.walk*(1-0.6*(client.loyalty||0)))){
      c.talk="lost";c.outcome="walked";c.stage="done";
      c.transcript.push({who:"client",text:clArtistFill(bi.no,c)});
      c.transcript.push({who:"note",text:client.first+" walked out."});
    }else{
      c.talk="insisted";c.mood-=0.05;
      c.transcript.push({who:"client",text:clArtistFill(bi.insist,c)});
    }
  }else if(opt.kind==="price"){
    c.stage="quote";c.transcript.push({who:"artist",text:"Let's talk about price."});
  }else if(opt.kind==="quote"){
    if(choiceId==="decline"){
      c.transcript.push({who:"artist",text:"I don't think I'm the right artist for this one. Let me tell you who might be."});
      c.transcript.push({who:"client",text:"Oh. Well. Thank you for being honest."});
      c.outcome="declined";c.stage="done";
    }else c.quote=clQuote(c,choiceId,r);
  }
  /* the last exchange must be the quote: if they haven't heard one by now, the next options are quote-only */
  if(c.stage!=="done"&&c.step>=c.max-1&&c.stage==="talk")c.stage="quote";
  if(c.stage!=="done"&&c.step>=c.max&&!c.quote){c.stage="done";c.outcome=c.outcome||"walked";c.transcript.push({who:"note",text:"They left to think about it."});}
  c.mood=clamp(c.mood,0,1);
  return c;
}
function clQuote(c,choiceId,r){
  const client=c.client,t=client.traits||{},Q=QUOTE,o=Q.options[choiceId];
  const est=clEstimate(c.ask,client,{});
  let price=est.hours*c.rate*o.mult;
  const ret=c.ret;
  if(ret&&ret.rule==="touchup")price=(weekIndex(c.week,c.year)-weekIndex(ret.w||c.week,ret.year||c.year))<Q.touchupFreeWeeks?0:price*Q.touchupMult;
  price=Math.round(price/Q.round)*Q.round;
  const deposit=price>0?Math.min(Math.round(price*Q.depositMax/Q.round)*Q.round,Math.max(Math.round(Q.depositMin*SIM.priceIndex(c.year)/Q.round)*Q.round,Math.round(price*Q.deposit/Q.round)*Q.round)):0;
  const sigW=c.ask&&c.ask.sig?SIGNATURE.wtp*(client.theme==="collector"?SIGNATURE.collector/1.4:1):1;   // PR 7: "your thing" (collectors weight it more)
  const wtp=est.hours*lerp(Q.wtpLo,Q.wtpHi,t.budget||0.5)*SIM.priceIndex(c.year)*(1+Q.wtpLoyal*(client.loyalty||0))*sigW;
  const ratio=wtp>0?price/wtp:0;
  const coll=client.theme==="collector"?1:0;
  const waitOk=lerp(Q.waitOk,Q.waitOkLoyal,client.loyalty||0)+coll*Q.waitOkCollector;
  let pa=Q.acceptAt1-Q.acceptSlope*(ratio-1)+Q.moodK*(c.mood-0.5)-Q.waitHit*Math.max(0,c.wait-waitOk);
  if(price===0)pa=0.99;
  pa=clamp(pa,Q.acceptMin,Q.acceptMax);
  const yes=r.chance(pa);
  const hrs=est.hours,ss=est.sessions;
  const when=c.wait<1?"next week":c.wait<2?"in a couple of weeks":"in about "+Math.round(c.wait)+" weeks";
  c.transcript.push({who:"artist",text:price>0?(hrs<=1?"About an hour":"About "+hrs+" hours")+(ss>1?" over "+ss+" sessions":"")+". "+fmtRub(price)+", with a "+fmtRub(deposit)+" deposit to book. I can start "+when+".":"This one's on me. Come in "+when+"."});
  c.transcript.push({who:"client",text:yes?(ratio<0.85?"That's fair. Book me in.":ratio<1.1?"OK. Yes. Let's do it.":"It's a lot. But I want it done right. Yes."):(c.wait>waitOk+20?"That's too long to wait. Sorry.":ratio>1.2?"That's more than I can do. Sorry.":"I need to think about it.")});
  c.outcome=yes?"accepted":"walked";c.stage="done";
  return{price,deposit,hours:hrs,sessions:ss,option:choiceId,mult:o.mult,wtp:Math.round(wtp),accept:clR2(pa),wait:c.wait};
}
const fmtRub=n=>Math.round(n).toLocaleString("en-CA")+" ₽";
/* consultCommit(S, consult) -> {client, item}: the client joins S.clients if new; history, loyalty and known are
   written; an accepted job books its first session into S.queue (after the wait) and the deposit goes into S.cash */
function consultCommit(S,c){
  const client=c.client;
  let isNew=!S.clients.some(x=>x.id===client.id);
  if(isNew)S.clients.push(client);
  client.known=c.known;
  if(c.talk==="won"||c.talk==="insisted"||c.outcome==="accepted")client.ask=c.ask;
  const e={w:S.week,y:S.year,kind:"consult",outcome:c.outcome,src:c.src,asked:c.asked.slice()};
  if(c.talk)e.talk=c.talk;if(c.bad)e.bad=c.bad;
  if(c.quote)e.quote={price:c.quote.price,deposit:c.quote.deposit,option:c.quote.option};
  if(c.ret)e.ret=c.ret.rule;
  clientLog(client,e);
  if(c.talk==="won")loyaltyBump(client,LOYALTY.talkedWon+(c.respect||0)-0.1);
  else if(c.talk==="lost")loyaltyBump(client,"talkedLost");
  else if(c.talk==="insisted")loyaltyBump(client,"insisted");
  if(c.outcome==="accepted"){loyaltyBump(client,"accepted");if(c.quote&&c.quote.option==="q_high")loyaltyBump(client,"quoteHigh");if(c.quote&&c.quote.option==="q_low")loyaltyBump(client,"quoteLow");}
  else if(c.outcome==="walked"&&!c.talk)loyaltyBump(client,"walked");
  else if(c.outcome==="declined")loyaltyBump(client,"declined");
  if(c.item)S.queue=S.queue.filter(q=>q.id!==c.item);
  let item=null;
  if(c.outcome==="accepted"&&c.quote){
    const q=c.quote,n=Math.max(1,q.sessions||1),due=weekFrom(clNow(S)+Math.max(1,Math.ceil(c.wait)));
    item={id:queueId(S),kind:"session",client:client.id,w:due.w,y:due.y,hours:Math.max(0.5,Math.round(q.hours/n*4)/4),
      sessionNo:1,sessions:n,price:q.price,deposit:q.deposit,paid:q.deposit,ask:c.ask,design:null,booked:{w:S.week,y:S.year},moved:0};
    if(c.ret)item.ret=c.ret;
    S.queue.push(item);
    cashIn(S,q.deposit,"deposit");
  }
  if(S.skills&&SKILL_XP.consult)skillGain(S,"consult",(SKILL_XP.consult[c.outcome]||0)+(c.talk==="won"?SKILL_XP.consult.talkWon:0));   // PR 7
  return{client,item,isNew};
}
/* queue ids: q1, q2, ... (the max in the queue + 1, so ids are unique among live items) */
function queueId(S){let mx=0;for(const q of S.queue)if(q.id){const n=+String(q.id).slice(1);if(n>mx)mx=n;}return "q"+(mx+1);}
/* how many weeks of booked session hours are ahead of a new client */
function waitWeeks(S){
  const hpw=(typeof weekHours==="function")?weekHours(S):30;let h=0;
  for(const q of S.queue)if(q.kind==="session")h+=q.hours||0;
  return Math.round(h/Math.max(1,hpw)*10)/10;
}

/* ===== referrals and returns ===== */
/* referral(client, r, opts) -> a new client sent by `client` (referredBy = client.id; the brief names them).
   opts = makeClient opts (year, week, stage, id, ...) plus label: the piece that did the talking */
function referral(client,r,opts){
  opts=Object.assign({},opts||{});
  const c=makeClient(r,Object.assign(opts,{referredBy:client,referrerLabel:opts.label||null,src:"referral",badIdea:false}));
  return c;
}
/* the brief for a return, in the client's voice, naming the piece and its year */
function clReturnBrief(rule,piece,r,foreign){
  const place=clPlaceName(piece?piece.design.placement:foreign.placement);
  return clSlotFill(clPick(r,rule.brief),{label:piece?piece.label:foreign.label,place,year:piece?piece.y:foreign.y,foreign:foreign?foreign.label:"",where:foreign?foreign.where:""});
}
/* the new ask for a return, from the old piece */
function clReturnAsk(rule,piece,client,r,foreign){
  const P=SIM.PLACEMENTS||{},d=piece?piece.design:{placement:foreign.placement,sizeMm:foreign.sizeMm,style:"traditional"};
  const sz=SIZE_CLASSES[rule.size]||SIZE_CLASSES.small;
  const ask={placement:d.placement,sizeMm:r.int(sz[0],sz[1]),style:d.style||"traditional",tags:(client.wants&&client.wants.tags||[]).slice(0,3),theme:"return",size:rule.size,bad:null};
  if(rule.ask==="same"){ask.sizeMm=d.sizeMm||ask.sizeMm;}
  else if(rule.ask==="near"){const p=P[d.placement]||{};const near={arm:["forearm","upperarm","shoulder"],shoulder:["upperarm","forearm"],leg:["thigh","calf","shin"]}[p.region];
    if(near&&p.side){const cand=near.map(b=>b+"_"+p.side).filter(id=>P[id]&&id!==d.placement);if(cand.length)ask.placement=clPick(r,cand);}}
  else if(rule.ask==="grow"){const p=P[d.placement];ask.placement=p&&p.region==="leg"?"thigh_"+(p.side||"r"):"upperarm_"+((p&&p.side)||"r");ask.sizeMm=Math.max(ask.sizeMm,220);}
  else if(rule.ask==="cover"){ask.sizeMm=Math.round(Math.max(ask.sizeMm,(d.sizeMm||40)*1.4));ask.style=r.pick(["blackwork","japanese","neotrad","traditional"]);ask.cover=true;}
  if(!P[ask.placement])ask.placement=d.placement||"forearm_r";
  return ask;
}
/* scheduleReturns(S, r): roll RETURN_RULES for every piece (weekly chance spread over each rule's window) and queue a
   "consult" item (src "return") for the client, at most one pending return per client. Returns the new items. */
function scheduleReturns(S,r){
  const now=clNow(S),pending={},out=[];
  for(const q of S.queue)if(q.kind==="consult"||q.kind==="session")pending[q.client]=1;
  const idx=new Map();for(const c of S.clients)idx.set(c.id,c);
  const lastPiece={};for(const p of S.pieces)lastPiece[p.client]=p;
  const P=SIM.PLACEMENTS||{};
  for(const p of S.pieces){
    if(pending[p.client])continue;
    const c=idx.get(p.client);if(!c)continue;   // PR 7: a compacted client can come back (expandClient below)
    const age=now-weekIndex(p.w,p.y);if(age<1)continue;
    for(const rule of RETURN_RULES){
      if(age<rule.after[0]||age>rule.after[1])continue;
      if(rule.foreign&&lastPiece[p.client]!==p)continue;
      const need=rule.needs||{};
      if(need.region&&need.region.indexOf((P[p.design.placement]||{}).region)<0)continue;
      if(need.early&&!(p.stage==="apprentice"||p.y-2000<need.early))continue;
      const pw=lerp(rule.p[0],rule.p[1],c.loyalty||0),len=rule.after[1]-rule.after[0]+1;
      const weekly=1-Math.pow(1-pw,1/len);
      if(!r.chance(weekly))continue;
      if(c.compact)expandClient(S,c);
      let foreign=null;
      if(rule.foreign){
        /* someone else's work, from a year the client was already an adult */
        const born=c.born!=null?c.born:S.year-(c.age||30),fy=Math.max(born+18,S.year-r.int(2,15));
        if(fy>=S.year)continue;
        const f=clPick(r,FOREIGN_PIECES.filter(x=>!x.from||fy>=x.from));const pl=clPlace(r,clPick(r,["forearm","upperarm","calf","shoulder"]));
        foreign={label:f.label,where:f.where,placement:pl,sizeMm:r.int(30,80),y:fy};}
      const brief=clReturnBrief(rule,foreign?null:p,r,foreign);
      const ask=clReturnAsk(rule,foreign?null:p,c,r,foreign);
      const ret={rule:rule.id,piece:foreign?null:p.id,label:foreign?foreign.label:p.label,year:foreign?foreign.y:p.y,w:foreign?1:p.w,place:foreign?foreign.placement:p.design.placement};
      if(foreign)ret.foreign=foreign;
      const due=weekFrom(now+r.int(0,2));
      const item={id:queueId(S),kind:"consult",src:"return",client:c.id,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+CAL_CONSULT_WAIT,brief,ask,ret};
      if(rule.reckoning)item.beat=null;   // PR 8: SIM.onReturn may set a RECKONINGS id here
      if(typeof SIM.onReturn==="function")SIM.onReturn(item,S);
      c.brief=brief;c.ask=ask;
      S.queue.push(item);out.push(item);pending[c.id]=1;
      break;
    }
  }
  return out;
}
const CAL_CONSULT_WAIT=2;   // weeks a booked consult (return or referral) waits before they give up

SIM.WEEKS_PER_YEAR=WEEKS_PER_YEAR;SIM.weekIndex=weekIndex;SIM.weekFrom=weekFrom;
SIM.CLIENT_TRAITS=CLIENT_TRAITS;SIM.AGE_BANDS=AGE_BANDS;SIM.PRONOUNS=PRONOUNS;SIM.NAMES=NAMES;SIM.JOBS=JOBS;SIM.BRIEFS=BRIEFS;
SIM.BRIEF_SLOTS=BRIEF_SLOTS;SIM.SIZE_CLASSES=SIZE_CLASSES;SIM.STYLE_COLOUR=STYLE_COLOUR;SIM.HIDDEN_WANTS=HIDDEN_WANTS;
SIM.BAD_IDEAS=BAD_IDEAS;SIM.BAD_IDEA_CHANCE=BAD_IDEA_CHANCE;SIM.CONSULT_QUESTIONS=CONSULT_QUESTIONS;SIM.CONSULT_ANSWERS=CONSULT_ANSWERS;
SIM.CONSULT=CONSULT;SIM.QUOTE=QUOTE;SIM.LOYALTY=LOYALTY;SIM.REVIEWS=REVIEWS;SIM.REVIEW_CHANCE=REVIEW_CHANCE;SIM.FOREIGN_PIECES=FOREIGN_PIECES;
SIM.RETURN_RULES=RETURN_RULES;SIM.REFERRAL=REFERRAL;SIM.PLACE_WORDS=PLACE_WORDS;SIM.placeWords=clPlaceName;
SIM.styleDemand=styleDemand;SIM.makeClient=makeClient;SIM.clientAge=clientAge;SIM.clientLog=clientLog;SIM.loyaltyBump=loyaltyBump;
SIM.writeReview=writeReview;SIM.findClient=findClient;SIM.pieceLabel=pieceLabel;SIM.pieceName=pieceName;SIM.addPiece=addPiece;
SIM.consultStart=consultStart;SIM.consultOptions=consultOptions;SIM.consultChoose=consultChoose;SIM.consultCommit=consultCommit;
SIM.referral=referral;SIM.scheduleReturns=scheduleReturns;SIM.proxyDesign=clProxyDesign;SIM.estimate=clEstimate;SIM.waitWeeks=waitWeeks;SIM.queueId=queueId;SIM.clNextId=clNextId;SIM.clientId=clNextId;
