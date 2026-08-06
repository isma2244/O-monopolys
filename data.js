
// O Monopolis — data del juego.
// Los importes están en euros de juego, ya ajustados a los billetes 10/50/100/200/500/1000/5000.

export const START_MONEY = 15000;
export const PASS_GO_AMOUNT = 2000;

export const TOKENS = [
  { id: "cabuxa", label: "🐐 Cabuxa" },
  { id: "tractor", label: "🚜 Tractor" },
  { id: "viño", label: "🍷 Viño" },
  { id: "casa", label: "🏠 Casa" },
  { id: "castaña", label: "🌰 Castaña" },
  { id: "bus", label: "🚌 Bus" },
  { id: "balon", label: "⚽ Balón" },
  { id: "forno", label: "🔥 Forno" }
];

export const PROPERTY_DATA = {
  "rua-o-pozo": { name:"Rúa O Pozo", group:"brown", price:600, mortgage:300, houseCost:500, hotelCost:500, rents:[20,100,300,900,1600,2500] },
  "rua-calvario": { name:"Rúa Calvario", group:"brown", price:600, mortgage:300, houseCost:500, hotelCost:500, rents:[40,200,600,1800,3200,4500] },
  "rua-nogueira": { name:"Rúa Nogueira", group:"sky", price:1000, mortgage:500, houseCost:500, hotelCost:500, rents:[60,300,900,2700,4000,5500] },
  "rua-da-canella": { name:"Rúa Da Canella", group:"sky", price:1000, mortgage:500, houseCost:500, hotelCost:500, rents:[60,300,900,2700,4000,5500] },
  "rua-o-rial": { name:"Rúa O Rial", group:"sky", price:1200, mortgage:600, houseCost:500, hotelCost:500, rents:[80,400,1000,3000,4500,6000] },
  "rua-calleteiro": { name:"Rúa Calleteiro", group:"magenta", price:1400, mortgage:700, houseCost:1000, hotelCost:1000, rents:[100,500,1500,4500,6250,7500] },
  "rua-cachon": { name:"Rúa Cachón", group:"magenta", price:1600, mortgage:800, houseCost:1000, hotelCost:1000, rents:[100,500,1500,4500,6250,7500] },
  "rua-fendonces": { name:"Rúa Fendonces", group:"magenta", price:1600, mortgage:800, houseCost:1000, hotelCost:1000, rents:[120,600,1800,5000,7000,9000] },
  "karting-chaves": { name:"Karting Chaves", group:"orange", price:1800, mortgage:900, houseCost:1000, hotelCost:1000, rents:[140,700,2000,5500,7500,9500] },
  "merendoiro": { name:"Merendoiro", group:"orange", price:2000, mortgage:1000, houseCost:1000, hotelCost:1000, rents:[140,700,2000,5500,7500,9500] },
  "embalse-de-campos": { name:"Embalse de Campos", group:"orange", price:2000, mortgage:1000, houseCost:1000, hotelCost:1000, rents:[160,800,2200,6000,8000,10000] },
  "resort-da-tia-otilia": { name:"Resort Da Tía Otilia", group:"red", price:2200, mortgage:1100, houseCost:1500, hotelCost:1500, rents:[180,900,2500,7000,8750,10500] },
  "portozon": { name:"Portozón", group:"red", price:2400, mortgage:1200, houseCost:1500, hotelCost:1500, rents:[180,900,2500,7000,8750,10500] },
  "rio-do-molino": { name:"Río Do Molino", group:"red", price:2400, mortgage:1200, houseCost:1500, hotelCost:1500, rents:[200,1000,3000,7500,9250,11000] },
  "foxo-do-lobo": { name:"Foxo Do Lobo", group:"yellow", price:2600, mortgage:1300, houseCost:1500, hotelCost:1500, rents:[220,1100,3300,8000,9750,11500] },
  "forno": { name:"Forno", group:"yellow", price:2800, mortgage:1400, houseCost:1500, hotelCost:1500, rents:[220,1100,3300,8000,9750,11500] },
  "igrexa": { name:"Igrexa", group:"yellow", price:2800, mortgage:1400, houseCost:1500, hotelCost:1500, rents:[240,1200,3600,8500,10250,12000] },
  "pedralonga": { name:"Pedralonga", group:"green", price:3000, mortgage:1500, houseCost:2000, hotelCost:2000, rents:[260,1300,3900,9000,11000,12750] },
  "cachon-da-cenza": { name:"Cachón Da Cenza", group:"green", price:3200, mortgage:1600, houseCost:2000, hotelCost:2000, rents:[260,1300,3900,9000,11000,12750] },
  "reitoral-da-chaira": { name:"Reitoral Da Chaira", group:"green", price:3200, mortgage:1600, houseCost:2000, hotelCost:2000, rents:[280,1500,4500,10000,12000,14000] },
  "tanatorio": { name:"Tanatorio", group:"blue", price:3500, mortgage:1750, houseCost:2000, hotelCost:2000, rents:[350,1750,5000,11000,13000,15000] },
  "praza": { name:"Praza", group:"blue", price:4000, mortgage:2000, houseCost:2000, hotelCost:2000, rents:[500,2000,6000,14000,17000,20000] }
};

export const STATION_DATA = {
  "a-gudina-porta-de-galicia": { name:"A Gudiña - Porta de Galicia", price:2000, mortgage:1000, rents:[250,500,1000,2000] },
  "estacion-buses-verin": { name:"Estación de Buses - Verín", price:2000, mortgage:1000, rents:[250,500,1000,2000] },
  "estacion-campobecerros": { name:"Estación de Campobecerros", price:2000, mortgage:1000, rents:[250,500,1000,2000] },
  "o-chiringuito": { name:"O Chiringuito", price:2000, mortgage:1000, rents:[250,500,1000,2000] }
};

// Orden del tablero: empieza en Piornedo, esquina inferior derecha, y avanza en sentido horario.
export const BOARD = [
  { id:"go", name:"Piornedo", type:"go", x:74.23, y:90.79 },
  { id:"rua-o-pozo", name:"Rúa O Pozo", type:"property", propertyId:"rua-o-pozo", x:67.73, y:90.79 },
  { id:"caixa-1", name:"Caixa Veciñal", type:"fee", fee:1500, x:63.27, y:90.79 },
  { id:"rua-calvario", name:"Rúa Calvario", type:"property", propertyId:"rua-calvario", x:58.83, y:90.79 },
  { id:"servizos-1", name:"Servizos", type:"service", x:54.4, y:90.79 },
  { id:"o-chiringuito", name:"O Chiringuito", type:"station", stationId:"o-chiringuito", x:49.96, y:90.79 },
  { id:"rua-nogueira", name:"Rúa Nogueira", type:"property", propertyId:"rua-nogueira", x:45.52, y:90.79 },
  { id:"cartina-1", name:"Cartiña", type:"event", x:41.08, y:90.79 },
  { id:"rua-da-canella", name:"Rúa Da Canella", type:"property", propertyId:"rua-da-canella", x:36.65, y:90.79 },
  { id:"rua-o-rial", name:"Rúa O Rial", type:"property", propertyId:"rua-o-rial", x:32.19, y:90.79 },
  { id:"campo-futbol", name:"Campo de Fútbol / Granxa Eloi", type:"corner", x:25.71, y:90.79 },

  { id:"rua-calleteiro", name:"Rúa Calleteiro", type:"property", propertyId:"rua-calleteiro", x:25.71, y:79.96 },
  { id:"cartina-2", name:"Cartiña", type:"money", x:25.71, y:72.54 },
  { id:"rua-cachon", name:"Rúa Cachón", type:"property", propertyId:"rua-cachon", x:25.71, y:64.82 },
  { id:"rua-fendonces", name:"Rúa Fendonces", type:"property", propertyId:"rua-fendonces", x:25.71, y:57.25 },
  { id:"a-gudina-porta-de-galicia", name:"A Gudiña - Porta de Galicia", type:"station", stationId:"a-gudina-porta-de-galicia", x:25.71, y:49.68 },
  { id:"karting-chaves", name:"Karting Chaves", type:"property", propertyId:"karting-chaves", x:25.71, y:42.14 },
  { id:"servizos-2", name:"Servizos", type:"service", x:25.71, y:34.57 },
  { id:"merendoiro", name:"Merendoiro", type:"property", propertyId:"merendoiro", x:25.71, y:27.04 },
  { id:"embalse-de-campos", name:"Embalse de Campos", type:"property", propertyId:"embalse-de-campos", x:25.71, y:19.43 },
  { id:"parking", name:"Casa do Pobo", type:"parking", x:25.71, y:8.68 },

  { id:"resort-da-tia-otilia", name:"Resort Da Tía Otilia", type:"property", propertyId:"resort-da-tia-otilia", x:32.19, y:8.68 },
  { id:"cartina-3", name:"Cartiña", type:"money", x:36.65, y:8.68 },
  { id:"portozon", name:"Portozón", type:"property", propertyId:"portozon", x:41.08, y:8.68 },
  { id:"rio-do-molino", name:"Río Do Molino", type:"property", propertyId:"rio-do-molino", x:45.52, y:8.68 },
  { id:"estacion-buses-verin", name:"Estación de Buses - Verín", type:"station", stationId:"estacion-buses-verin", x:49.96, y:8.68 },
  { id:"foxo-do-lobo", name:"Foxo Do Lobo", type:"property", propertyId:"foxo-do-lobo", x:54.4, y:8.68 },
  { id:"forno", name:"Forno", type:"property", propertyId:"forno", x:58.83, y:8.68 },
  { id:"servizos-3", name:"Servizos", type:"service", x:63.27, y:8.68 },
  { id:"igrexa", name:"Igrexa", type:"property", propertyId:"igrexa", x:67.73, y:8.68 },
  { id:"a-fonte", name:"A Fonte", type:"corner", x:74.23, y:8.68 },

  { id:"pedralonga", name:"Pedralonga", type:"property", propertyId:"pedralonga", x:74.23, y:19.43 },
  { id:"cachon-da-cenza", name:"Cachón Da Cenza", type:"property", propertyId:"cachon-da-cenza", x:74.23, y:27.04 },
  { id:"caixa-2", name:"Caixa Veciñal", type:"fee", fee:1500, x:74.23, y:34.57 },
  { id:"reitoral-da-chaira", name:"Reitoral Da Chaira", type:"property", propertyId:"reitoral-da-chaira", x:74.23, y:42.14 },
  { id:"estacion-campobecerros", name:"Estación de Campobecerros", type:"station", stationId:"estacion-campobecerros", x:74.23, y:49.68 },
  { id:"cartina-4", name:"Cartiña", type:"event", x:74.23, y:57.25 },
  { id:"tanatorio", name:"Tanatorio", type:"property", propertyId:"tanatorio", x:74.23, y:64.82 },
  { id:"servizos-4", name:"Servizos", type:"service", x:74.23, y:72.54 },
  { id:"praza", name:"Praza", type:"property", propertyId:"praza", x:74.23, y:79.96 }
];

export const EVENT_CARDS = [
  { text:"Móvete ata a casilla do Reitoral da Chaira pasando por Piornedo, pero perdes dúas quendas porque a comida é moi elaborada.", action:{ type:"moveTo", spaceId:"reitoral-da-chaira", passGo:true, skip:2 } },
  { text:"Móvete ata a casilla do Cachón da Cenza pasando por Piornedo, pero perdes unha quenda porque o camiño está cheo de xestas e non atopas os carteis.", action:{ type:"moveTo", spaceId:"cachon-da-cenza", passGo:true, skip:1 } },
  { text:"Tes o poder da Raluka. Montas unha cantina no Forno e pasa a ser da túa propiedade.", action:{ type:"takeProperty", propertyId:"forno" } },
  { text:"Atopas 5 paquetes de tabaco e o Rumano acepta a cambio. Garda esta carta: libérate de traballar na granxa do Eloi.", action:{ type:"keep", label:"Libre da granxa" } },
  { text:"Invitáronte a unha churrascada na Casa do Pobo. Móvete ata a casilla correspondente pasando pola casilla de Piornedo.", action:{ type:"manual" } },
  { text:"Hai pool party nas Piscinas do Riós pero é tarde, así que vas directamente na bici do Julen sen pasar por Piornedo.", action:{ type:"manual" } },
  { text:"Axudaches ao Clemente a cementar: o alcalde débelle un favor. Garda esta carta para librarte de traballar na granxa.", action:{ type:"keep", label:"Favor do alcalde" } },
  { text:"Vas ata o Foxo do Lobo, pero á volta pinchas unha roda. Perdes unha quenda.", action:{ type:"moveTo", spaceId:"foxo-do-lobo", passGo:false, skip:1 } },
  { text:"Invitáronte a unha pachanga contra os de Cortegada e San Pedro. Avanza ata o Campo de Fútbol.", action:{ type:"moveTo", spaceId:"campo-futbol", passGo:false } },
  { text:"É a festa de Piornedo! Podes avanzar ata A Praza, pero tes que pagar 250€ pola cena.", action:{ type:"moveToPay", spaceId:"praza", amount:250 } },
  { text:"As vacas escapáronse, tes que buscalas. Perdes unha quenda.", action:{ type:"skip", turns:1 } },
  { text:"O Quinqué convídate a uns viños. Avanza ata a Bodega do Quinqué.", action:{ type:"manual" } },
  { text:"Cruzaches co rebaño no medio da estrada! Retrocede 2 casillas.", action:{ type:"moveRelative", delta:-2 } },
  { text:"A festa segue na Pedralonga porque Andoni trouxo Jäger. Avanza ata alí pero perdes dúas quendas para recuperarte da resaca.", action:{ type:"moveTo", spaceId:"pedralonga", passGo:false, skip:2 } },
  { text:"O campo de fútbol está cheo! Quédate unha quenda mirando a pachanga.", action:{ type:"skip", turns:1 } },
  { text:"É o entroido! Disfrazaste e colles un taxi ata Verín. Avanzas ata a Estación de Buses de Verín sen pasar por Piornedo.", action:{ type:"moveTo", spaceId:"estacion-buses-verin", passGo:false } },
  { text:"Fai moito calor e decides ir ao Río do Muíño. Caíches mal e perdes unha unlla. Quedas tres quendas sen xogar.", action:{ type:"skip", turns:3 } },
  { text:"Atopaches un atallo polo monte! Avanza 4 casillas.", action:{ type:"moveRelative", delta:4 } },
  { text:"Andan cotilleando. Retrocede ata o Forno.", action:{ type:"moveTo", spaceId:"forno", passGo:false } },
  { text:"A tía Otilia cóntache historias e convídate a un licor café. Perde unha quenda escoitando.", action:{ type:"skip", turns:1 } },
  { text:"Hoxe é día de asado! Avanza ata o Merendoiro de Monteveloso pero pasas antes por Piornedo.", action:{ type:"moveTo", spaceId:"merendoiro", passGo:true } },
  { text:"Perdícheste facendo a ruta da Castaña. Acabas no Reitoral da Chaira preguntando como volver ata Piornedo.", action:{ type:"moveTo", spaceId:"reitoral-da-chaira", passGo:false } },
  { text:"Os cans do Eloi ladráronche toda a noite. Non puideches durmir ben, retrocede 3 casillas.", action:{ type:"moveRelative", delta:-3 } },
  { text:"Volves de festa, intentas durmir pero o Vicente e a súa radial teñen outros plans. Perdes unha quenda durmindo nun prado.", action:{ type:"skip", turns:1 } },
  { text:"Joseba e Ismael fundaron a Escola de Baile Danza co KuDuro. Avanza ata O Forno para poder asistir á inauguración.", action:{ type:"moveTo", spaceId:"forno", passGo:false } },
  { text:"O Rumano mándate traballar á granxa do Eloi. Vas ao Campo de Fútbol / Granxa Eloi e perdes dúas quendas, salvo que teñas unha carta para librarte.", action:{ type:"goToFarm", turns:2 } }
];

export const MONEY_CARDS = [
  { text:"Gañaches o premio da mellor tortilla de patacas na festa.", amount:500 },
  { text:"Fas de camareiro/a na festa de Piornedo.", amount:500 },
  { text:"Montas un negocio vendendo auga da fonte embotellada.", amount:1000 },
  { text:"Vendiches viño novo na Bodega do Quinqué.", amount:1000 },
  { text:"Caiches no Cachón da Cenza e rompiches o móbil.", amount:-600 },
  { text:"O DJ cobrou de máis para estar máis tempo na verbena e tocouche a ti pagalo.", amount:-900 },
  { text:"Véndese unha casa en Piornedo a precio un pouco negociable. Comprádela entre todos/as.", each:-900 },
  { text:"A Panorama vén a Piornedo pero hai que pagala.", each:-500 },
  { text:"Hai que limpar a casa do pobo porque está manchada de noces verdes.", each:-100 },
  { text:"Hai churrascada no Forno, toca escotar a todos para a carne e a queimada.", each:-200 },
  { text:"É o Magosto e vendes as castañas que recolliches.", amount:800 },
  { text:"Os de San Pedro páganche o peixe que mataron.", amount:100 },
  { text:"Chegades de festa pero o Ismael non está en condicións de teletraballar e tes que substituílo.", amount:500 },
  { text:"Vendes as entradas que che sobraron da Feira do Viño.", amount:200 },
  { text:"Campionato de tute gañado no forno.", amount:500 },
  { text:"A vendima saiu redonda na Bodega do Quinqué.", amount:1200 },
  { text:"Gañaches o torneo de Salade.", amount:200 },
  { text:"Laura está durmindo a sesta e páganche por ir a espertala.", amount:200 },
  { text:"Derrama para arranxar o Forno, xa que o destrozaron na festa.", amount:-500 },
  { text:"Compras cemento para arranxar o campo de fútbol.", amount:-200 },
  { text:"Vas a Balaídos a ver o Celta-Alavés.", amount:-300 },
  { text:"Rompícheslle o pantalón ao Isaac no campo de fútbol.", amount:-200 },
  { text:"O señor de Ita lévate no taxi.", amount:-300 },
  { text:"Vas en autobús a visitar a fábrica de Kas de Vitoria.", amount:-500 },
  { text:"Ides a unha casa rural en Logroño.", each:-500 }
];
