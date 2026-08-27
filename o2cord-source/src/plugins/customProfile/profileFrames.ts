export interface ProfileFrameLayer {
    id: string;
    type: string;
    order: string;
    anchor: string;
    responsive: boolean;
}

export interface CustomProfileFrame {
    skuId: string;
    title: string;
    label: string;
    layers: ProfileFrameLayer[];
    innerWidth: number;
    overflowTop: number;
    overflowBottom: number;
    overflowHorizontal: number;
    type: number;
}

export const PROFILE_FRAMES: CustomProfileFrame[] = [
    {
        skuId: "1489398661619384321",
        title: "Retro Futurism",
        label: "A heavy steel mechanical frame with bolts, dials, and equipment panels lines the top and bottom edges of the profile, resembling a retrofuturistic device",
        layers: [
            { id: "1511863801518227588", type: "border", order: "front", anchor: "center", responsive: false },
            { id: "1511863804592521317", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1511863813127929897", type: "staple", order: "front", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 271, overflowBottom: 182, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1536493354450288680",
        title: "Symbiote",
        label: "Jagged black symbiote tendrils line the top and bottom edges of the profile",
        layers: [
            { id: "1536493443591708682", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1536493448750825562", type: "staple", order: "front", anchor: "bottom", responsive: false },
            { id: "1536493453150658600", type: "staple", order: "back", anchor: "top", responsive: false },
            { id: "1536493458490003548", type: "staple", order: "back", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 212, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1524512601827180624",
        title: "Prism Edge (Pink)",
        label: "A sleek glowing pink border with a subtle holographic sheen frames the profile",
        layers: [
            { id: "1524557375024009436", type: "border", order: "front", anchor: "center", responsive: false },
            { id: "1524557380090593321", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1524557384922697981", type: "staple", order: "front", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 127, overflowBottom: 123, overflowHorizontal: 38, type: 3
    },
    {
        skuId: "1524512219298267187",
        title: "Prism Edge (Blue)",
        label: "A sleek glowing blue border with a subtle holographic sheen frames the profile",
        layers: [
            { id: "1524512576686526606", type: "border", order: "front", anchor: "center", responsive: false },
            { id: "1524512580935352410", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1524512586375237712", type: "staple", order: "front", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 127, overflowBottom: 123, overflowHorizontal: 38, type: 3
    },
    {
        skuId: "1533925498961264871",
        title: "Blue Flame Skulls",
        label: "A row of grey skulls crowns the top of the profile with blue flames erupting from them",
        layers: [
            { id: "1533925847021518939", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1533925851752825032", type: "staple", order: "back", anchor: "top", responsive: false },
            { id: "1533925855338827867", type: "staple", order: "back", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 148, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1533925887098224730",
        title: "Red Flame Skulls",
        label: "A row of grey skulls crowns the top of the profile with red flames erupting from them",
        layers: [
            { id: "1534992785206411324", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1534992798002974751", type: "staple", order: "back", anchor: "top", responsive: false },
            { id: "1534992807885017249", type: "staple", order: "back", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 148, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1531413285243719880",
        title: "Fiery Eclipse",
        label: "A dark eclipse with dramatic clouds crowns the top of the profile, with glowing fiery light trailing down both sides",
        layers: [
            { id: "1533986938368036915", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1533986943057137715", type: "staple", order: "front", anchor: "bottom", responsive: false },
            { id: "1533986948220321862", type: "staple", order: "back", anchor: "top", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 212, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1531413463623139328",
        title: "Celestial Gold",
        label: "An ornate gold frame with celestial elements and dangling sun charm pendants",
        layers: [
            { id: "1532536721248616610", type: "rail", order: "front", anchor: "top", responsive: true },
            { id: "1532536724981547221", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1532536729821511811", type: "staple", order: "front", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 212, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1526697977513509007",
        title: "Bunnies & Strawberries",
        label: "Three white bunnies peeking over the top holding strawberries surrounded by more strawberries and white flowers",
        layers: [
            { id: "1526698280728133723", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1526698286248099932", type: "staple", order: "front", anchor: "bottom", responsive: false },
            { id: "1526698290215784569", type: "staple", order: "back", anchor: "top", responsive: false },
            { id: "1526698294841970698", type: "staple", order: "back", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 140, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1524190883036266636",
        title: "Celestial Crest",
        label: "A deep navy and gold border with crescent moons, stars, and diamond accents frames the profile with an ornate celestial crest at the top",
        layers: [
            { id: "1524191327024320522", type: "border", order: "front", anchor: "center", responsive: false },
            { id: "1524191334083067904", type: "rail", order: "front", anchor: "center", responsive: true },
            { id: "1524191337790836907", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1524191342538915931", type: "staple", order: "front", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 127, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1526698360080306276",
        title: "Ocean Crest",
        label: "Bright blue illustrated water crests over the top and pools along the bottom of the profile",
        layers: [
            { id: "1526698477919146044", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1526698483346706442", type: "staple", order: "front", anchor: "bottom", responsive: false },
            { id: "1526698487780212849", type: "staple", order: "back", anchor: "top", responsive: false },
            { id: "1526698492448211005", type: "staple", order: "back", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 212, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1524191647854891039",
        title: "Pastel Bunny Bow",
        label: "A pastel border adorned with a purple ribbon bow, small white bunnies, stars, and crescent moons frames the profile",
        layers: [
            { id: "1524192390502551724", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1524192394801713222", type: "staple", order: "front", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 126, overflowBottom: 116, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1524191448898080929",
        title: "Silver Heart",
        label: "A polished silver border with ornate heart and jewel accents surrounds the profile with an iridescent sheen",
        layers: [
            { id: "1526660575952764958", type: "border", order: "front", anchor: "center", responsive: false },
            { id: "1526660580260188300", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1526660586237067364", type: "staple", order: "front", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 216, overflowBottom: 103, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1524192423260061706",
        title: "Pink Cosmic Clouds",
        label: "Soft pink planets and dreamy cosmic clouds float above the profile against a pale sky",
        layers: [
            { id: "1526660205738328175", type: "rail", order: "front", anchor: "top", responsive: true },
            { id: "1526660211274944754", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1526660216026828950", type: "staple", order: "back", anchor: "top", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 0, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1524193178586972441",
        title: "Blue Cosmic Clouds",
        label: "Soft blue planets and dreamy cosmic clouds float above the profile against a pale sky",
        layers: [
            { id: "1526660272021045418", type: "rail", order: "front", anchor: "top", responsive: true },
            { id: "1526660277838282893", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1526660281802031224", type: "staple", order: "back", anchor: "top", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 0, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1524193380492509345",
        title: "White Cosmic Clouds",
        label: "Soft white planets and dreamy cosmic clouds float above the profile against a pale sky",
        layers: [
            { id: "1526660354694844456", type: "rail", order: "front", anchor: "top", responsive: true },
            { id: "1526660358712852691", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1526660363071000666", type: "staple", order: "back", anchor: "top", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 0, overflowHorizontal: 56, type: 3
    },
    {
        skuId: "1527085511544410274",
        title: "Purple Silk Star",
        label: "Flowing purple silk drapes across the top and bottom, with a glowing star centered at the top",
        layers: [
            { id: "1527085678985220128", type: "staple", order: "front", anchor: "top", responsive: false },
            { id: "1527085684559708260", type: "staple", order: "front", anchor: "bottom", responsive: false },
            { id: "1527085689269911692", type: "staple", order: "back", anchor: "top", responsive: false },
            { id: "1527085693535391774", type: "staple", order: "back", anchor: "bottom", responsive: false }
        ],
        innerWidth: 1200, overflowTop: 304, overflowBottom: 212, overflowHorizontal: 56, type: 3
    }
];
