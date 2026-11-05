/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Discord's own badge catalogue (what the "Your badges" window shows): name, description, rarity, the small
// icon, the big artwork and - for evolving badges like Nitro - every tier. The picture links are content
// addressed on Discord's CDN, so they don't change. Copied from Discord's BadgeDirectoryStore (Nov 2026);
// nothing in here belongs to any account.

export interface DirTier {
    key: string;
    name: string;
    rarity: number;
    icon: string;
    art: string;
    milestone: string;
}

export interface DirBadge {
    id: number;
    name: string;
    description: string;
    leveling: string;
    rarity: number;
    icon: string;
    art: string;
    tiers: DirTier[];
}

export const RARITY_NAMES: Record<number, string> = { 1: "Common", 2: "Rare", 3: "Epic", 4: "Legendary", 5: "Mythic" };

export const DIRECTORY: DirBadge[] = [
 {
  "id": 22,
  "name": "Discord Staff",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/5e74e9b61934fc1f67c65515d1f7e60d.png",
  "art": "https://cdn.discordapp.com/badge-icons/5e74e9b61934fc1f67c65515d1f7e60d.png",
  "tiers": []
 },
 {
  "id": 1,
  "name": "Nitro",
  "description": "Stay subscribed to Nitro to level up this badge.",
  "leveling": "Unlock more levels the longer you have Nitro.",
  "rarity": 3,
  "icon": "https://cdn.discordapp.com/assets/content/4f8a09a0cb53da23542326685cd8786e989e654362edf844bfeb970f3da1aa00.png",
  "art": "https://cdn.discordapp.com/assets/content/5c8d9feecf9b0160e9eeb1081c10be271ad7a7df3c47e1b0b8b99af02288f9bc.png",
  "tiers": [
   {
    "key": "starter",
    "name": "Starter",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/835f1fbfc62861a12021328aeb953e68b205383e57c477a754eecef9237fbaa6.png",
    "art": "https://cdn.discordapp.com/assets/content/a6c7aa95118d579d8a26d16b79cf5761a6fa95d3f4ec24c12907e32223e26a20.svg",
    "milestone": ""
   },
   {
    "key": "bronze",
    "name": "Bronze",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/05bee0b1bb4a1f9bfd4209f5d3a790b8cc02cecde73256eba3ecea751f1767f9.png",
    "art": "https://cdn.discordapp.com/assets/content/a0837200c383ca7b9e9b2e91358f6871ce8c7f3dd5ba98bbbb86305a205ac6ac.png",
    "milestone": "1 month"
   },
   {
    "key": "silver",
    "name": "Silver",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/ce00ed106a8f38879901531c00788820327ae1c33fa5a5838d61628f02583765.png",
    "art": "https://cdn.discordapp.com/assets/content/e97f6077a973b27a4abe03c0c3b0a52cb597beb6a048e84963e66ccd7c5b3f09.png",
    "milestone": "3 months"
   },
   {
    "key": "gold",
    "name": "Gold",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/6ecb8ab48a8abb284c3392dd956f8809fefca5f78c00e672454c16292051d576.png",
    "art": "https://cdn.discordapp.com/assets/content/1518ef16d0790bcc0d2a409db2e71a25d7b8726703150612a9b06b45219f4066.png",
    "milestone": "6 months"
   },
   {
    "key": "platinum",
    "name": "Platinum",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/8506db9c753ce9205cccbfcc17c1a60d2ad517eec52dc6d4ae3bb5eec5233db6.png",
    "art": "https://cdn.discordapp.com/assets/content/cc06a548690262c78f8389f6efec9c70bad9f9ab42062b796da90639e98a0f92.png",
    "milestone": "1 year"
   },
   {
    "key": "diamond",
    "name": "Diamond",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/4f8a09a0cb53da23542326685cd8786e989e654362edf844bfeb970f3da1aa00.png",
    "art": "https://cdn.discordapp.com/assets/content/5c8d9feecf9b0160e9eeb1081c10be271ad7a7df3c47e1b0b8b99af02288f9bc.png",
    "milestone": "2 years"
   },
   {
    "key": "emerald",
    "name": "Emerald",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/397d0f42ea7745d64690105c939008f0b53c02d4d8b4bee1447c525d459db93f.png",
    "art": "https://cdn.discordapp.com/assets/content/46e8d5a4a45dad7f45c494188397d3f59efc3a382f276cc5aee2eb404dbe10f1.png",
    "milestone": "3 years"
   },
   {
    "key": "ruby",
    "name": "Ruby",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/assets/content/615b989f8ef87e4f13521e9a78a23d2687ac9bba8a3a496d6c645002df94869b.png",
    "art": "https://cdn.discordapp.com/assets/content/68f1ae1d703c96eb430767dfffe4357aeace5c503fe89fa03ea73e1c313f8cab.png",
    "milestone": "5 years"
   },
   {
    "key": "opal",
    "name": "Opal",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/assets/content/0ea657f714e23f68c889d023035f9ea16ddf59acef5800ab95f041505aa7158d.png",
    "art": "https://cdn.discordapp.com/assets/content/c58e6f71e0d8336956b188961d65e7431eb3a2c2edc4709273ef9804a85343a5.png",
    "milestone": "6+ years"
   }
  ]
 },
 {
  "id": 21,
  "name": "Game Variety",
  "description": "Play more detectable PC games with Discord open to level up this badge.",
  "leveling": "Unlock more levels by playing more games.",
  "rarity": 1,
  "icon": "https://cdn.discordapp.com/assets/content/7265bc6f9ff0a47962dafe01b6f9c8f75927392aaf48d48c3619d123d2b584f5.png",
  "art": "https://cdn.discordapp.com/assets/content/5e965ee4ea5f88a2149b33897910afb6f662254204c1136e77fb32b62b78ca82.svg",
  "tiers": [
   {
    "key": "sampler",
    "name": "Sampler",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/cbd75cae9bca1c49b35eb0d9c189af4c8604b4f69a1de17ae550db9f03cbd371.png",
    "art": "https://cdn.discordapp.com/assets/content/796135a2c54b35bc73ba0928b8fb6a9e94be5c97573800ce0a20830b451650b9.svg",
    "milestone": "2 games"
   },
   {
    "key": "dabbler",
    "name": "Dabbler",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/c9fe2cefaf224c0fb73a5fe11476987930809fa307069deb8bbb2f0b99bac545.png",
    "art": "https://cdn.discordapp.com/assets/content/52915e33648e71ad341026a208d92ddbe09c1811e16fd2d9848bf242f6072de1.svg",
    "milestone": "5 games"
   },
   {
    "key": "enthusiast",
    "name": "Enthusiast",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/e016406cec55df228f6e4e7ee9ec5ac10cf0ccd5037c5926da5c26c44e32d374.png",
    "art": "https://cdn.discordapp.com/assets/content/5169b99e09ee3d398f335908d6a5073ed2e5705951362119c55c9b4cafbf9a0a.svg",
    "milestone": "10 games"
   },
   {
    "key": "ranger",
    "name": "Ranger",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/7265bc6f9ff0a47962dafe01b6f9c8f75927392aaf48d48c3619d123d2b584f5.png",
    "art": "https://cdn.discordapp.com/assets/content/5e965ee4ea5f88a2149b33897910afb6f662254204c1136e77fb32b62b78ca82.svg",
    "milestone": "15 games"
   },
   {
    "key": "explorer",
    "name": "Explorer",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/ffd4938d41c57d27fec0f253a54756c40add56f761c5b1471b531d838e8669db.png",
    "art": "https://cdn.discordapp.com/assets/content/0348e010aebcd3bd63023d5103a33def3fde5eb5d7533d460fb04bcb02d4407a.svg",
    "milestone": "20 games"
   },
   {
    "key": "adventurer",
    "name": "Adventurer",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/dcfdce8dfc254b6e8fa9cfba5dcd918f027e27554c3aa2403fe01eb319cf2194.png",
    "art": "https://cdn.discordapp.com/assets/content/17f6b6cf4d586ca2ba01ef6c98e6c795552edf4d155c1547a09abb600c565f72.svg",
    "milestone": "30 games"
   },
   {
    "key": "voyager",
    "name": "Voyager",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/183d6521c3696b0b42f73dd9c319307490982a5dffdc34a923b760d82b20916a.png",
    "art": "https://cdn.discordapp.com/assets/content/ae9edbe4a39da0d66bfc61b378fdccf4f264d644bfc5819c218f67f5bbb93f6f.svg",
    "milestone": "40 games"
   },
   {
    "key": "maverick",
    "name": "Maverick",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/84d4695cdcbb350ad5385c06e87caf06835872135625a8bff6bac300af858412.png",
    "art": "https://cdn.discordapp.com/assets/content/2752ab99ed075e2b6215a86ea09533a8c4e391d4c1ae57babd20152ba3dd77c9.svg",
    "milestone": "60 games"
   },
   {
    "key": "polymath",
    "name": "Polymath",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/1d8d9e3254727d1a1c01b194f2d01ade4525dc8b85c39b877af09768eaf031be.png",
    "art": "https://cdn.discordapp.com/assets/content/b6b290ba9ea06e86c841af0c885703a620e0eafd13178e39b415599e10d38e88.svg",
    "milestone": "80 games"
   },
   {
    "key": "universalist",
    "name": "Universalist",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/assets/content/4731855cd51c1d45fd14dc088b80815ea0562a353b48db369092019fbcb44ec7.png",
    "art": "https://cdn.discordapp.com/assets/content/2d2224fbc170bef4ef5cfb2475acdc9a27b86d06f1016919a3269f640b5066b5.svg",
    "milestone": "100+ games"
   }
  ]
 },
 {
  "id": 20,
  "name": "Game Time",
  "description": "Play more hours of detectable PC games with Discord open to level up this badge.",
  "leveling": "Unlock more levels by playing more hours of games.",
  "rarity": 2,
  "icon": "https://cdn.discordapp.com/assets/content/4039caeef586467d50939f3154f87828645d6f1bd699b8f0c1da686b02cefe68.png",
  "art": "https://cdn.discordapp.com/assets/content/470d7a7519c51b46592d18b12f4aa07eaedf156b11ee13d22c81312fae38da1e.svg",
  "tiers": [
   {
    "key": "casual",
    "name": "Casual",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/c2844b37da74241525c1001c2ae5dd2719beb0095af8f88dcb35a37ceb0e1892.png",
    "art": "https://cdn.discordapp.com/assets/content/1f9d42f34184814a137e40b0de83e2cac0ae44d83531777b9369d2e2a6ddfeb3.svg",
    "milestone": "1 hour"
   },
   {
    "key": "recreational",
    "name": "Recreational",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/157b789531c602542070e680c410d74275e796b6c45cd717292f6d2a59593972.png",
    "art": "https://cdn.discordapp.com/assets/content/451e733482d640fac424b937ec8b27dc62e3426dc937ce35818d262e9bdb57c7.svg",
    "milestone": "5 hours"
   },
   {
    "key": "dedicated",
    "name": "Dedicated",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/d6ab0696aae97fca8e6b2b88d4117f09f9ea895d4f0cebee770564369ff06873.png",
    "art": "https://cdn.discordapp.com/assets/content/c12fc54ecf68afdeba97999f5378f93f10e476fb1c87e90a881ec5667e1ff9d1.svg",
    "milestone": "20 hours"
   },
   {
    "key": "committed",
    "name": "Committed",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/cc1edd8d955872cd9fbd9bafec80c973287817560d0895587686e3e1671a698e.png",
    "art": "https://cdn.discordapp.com/assets/content/2c1d8204adc7fc888fe13e3a5a0e25884e2ade87a218b0987d07be12d19a719f.svg",
    "milestone": "75 hours"
   },
   {
    "key": "serious",
    "name": "Serious",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/4039caeef586467d50939f3154f87828645d6f1bd699b8f0c1da686b02cefe68.png",
    "art": "https://cdn.discordapp.com/assets/content/470d7a7519c51b46592d18b12f4aa07eaedf156b11ee13d22c81312fae38da1e.svg",
    "milestone": "150 hours"
   },
   {
    "key": "devoted",
    "name": "Devoted",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/3d39b6cef7f00fe9e2d51f229034650b900481823af05d09e6537e912de30301.png",
    "art": "https://cdn.discordapp.com/assets/content/f7a892701a5628e95ec74caa814f722e96c4d62a66833de8239290fd2e3bf672.svg",
    "milestone": "300 hours"
   },
   {
    "key": "seasoned",
    "name": "Seasoned",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/46512ce94203c84d7919904acfbd07fc5a8316010a610b8fd6a1cc937e5ac75e.png",
    "art": "https://cdn.discordapp.com/assets/content/76fefae72378b331774887012577c8c942f4846b9bb1d9f58d39e867adf328e3.svg",
    "milestone": "500 hours"
   },
   {
    "key": "ironclad",
    "name": "Ironclad",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/9bff716e6bae2ef42dc959bac05a0dfc480bf89484c111ed7fb4aa0332cb22d8.png",
    "art": "https://cdn.discordapp.com/assets/content/d7a2df844cda56877b016e667f2fecead85a65c68a1487d4b2f94300d9d20f71.svg",
    "milestone": "1,000 hours"
   },
   {
    "key": "unshakeable",
    "name": "Unshakeable",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/1f51d59934543176d8b585c4e5a62d77ca3677c6e26ae4da74b1b639f9091b5e.png",
    "art": "https://cdn.discordapp.com/assets/content/7e51bb1c1a458e2328130a9559787bfc4e2fd47ea14640a6b1662786b0908e00.svg",
    "milestone": "2,000 hours"
   },
   {
    "key": "eternal",
    "name": "Eternal",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/assets/content/8a62ba720addf7584d3e7f82170104e6a2b35aea4aba5ffc7260cfd706f40c37.png",
    "art": "https://cdn.discordapp.com/assets/content/95fa54ec361bd5b8694f6510e1ac125af51f88dfc628b1a338e96d9aa2bc1d75.svg",
    "milestone": "5,000+ hours"
   }
  ]
 },
 {
  "id": 19,
  "name": "Streaming",
  "description": "Stream more hours to other users to level up this badge.",
  "leveling": "Unlock more levels by streaming more hours.",
  "rarity": 1,
  "icon": "https://cdn.discordapp.com/assets/content/522de4edcb75e0544633b9ccb55c58d672c4a2fa70a81231bd42bb56cd6555bd.png",
  "art": "https://cdn.discordapp.com/assets/content/29190ed5ba094118c4c3594978e0f5bb92beb55cdb9f0d0bc07d3f47b8377d8d.svg",
  "tiers": [
   {
    "key": "newcomer",
    "name": "Newcomer",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/571a6f607289dfc034d5735ea020bb53f29e9d53dcc54ee852f9f070538ff73a.png",
    "art": "https://cdn.discordapp.com/assets/content/e3bec9e7d48c79f2c7424995592a85f0e103fa51e6a9b151a6d17d611c9027e1.svg",
    "milestone": "1 hour"
   },
   {
    "key": "fledgling",
    "name": "Fledgling",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/3e1ec0a72ca812e53ecd53d55c18c2d9765cc89eee08b1e74f7e0bdbfe2e96a2.png",
    "art": "https://cdn.discordapp.com/assets/content/5bc109549867411b404808be65e7ca64d4142fe43dc40c59986244d62f400bea.svg",
    "milestone": "5 hours"
   },
   {
    "key": "breakout",
    "name": "Breakout",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/443707ffced738635bb0ee5c054544c67ec9dfab63b03e661bc1295d5399cac7.png",
    "art": "https://cdn.discordapp.com/assets/content/21b8d249afdf07418623f679c4899f08f8b400b36dee8c0640ce876b0027f81e.svg",
    "milestone": "20 hours"
   },
   {
    "key": "standout",
    "name": "Standout",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/522de4edcb75e0544633b9ccb55c58d672c4a2fa70a81231bd42bb56cd6555bd.png",
    "art": "https://cdn.discordapp.com/assets/content/29190ed5ba094118c4c3594978e0f5bb92beb55cdb9f0d0bc07d3f47b8377d8d.svg",
    "milestone": "75 hours"
   },
   {
    "key": "trendsetter",
    "name": "Trendsetter",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/9482ad3a1104986a4cce2979291c733eca0707f6218ddfb6ff36e32e3fd709e9.png",
    "art": "https://cdn.discordapp.com/assets/content/06b69da31f4d7800e1f5e6492912ac3c982f058bef2b63a7f59fec63c91c9a8d.svg",
    "milestone": "150 hours"
   },
   {
    "key": "headliner",
    "name": "Headliner",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/2cf2a4ab39800a963efdb900b823dc8ccb23464434f3e11d329851ae566cac22.png",
    "art": "https://cdn.discordapp.com/assets/content/8a996cdb590ba957bad9c3d306844792a1d2bb35552d245f7f9d80879b75df5f.svg",
    "milestone": "300 hours"
   },
   {
    "key": "star",
    "name": "Star",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/20e0b4ff7fc63681efe95082a69f9bfe7259f1485fa6fa6cebaf709336f42b90.png",
    "art": "https://cdn.discordapp.com/assets/content/54f39ff20bdd89d59288e41909344ef6d7d71f7d45d0b84e91acee34b6e973f3.svg",
    "milestone": "500 hours"
   },
   {
    "key": "sensation",
    "name": "Sensation",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/7ceb7fc55dba1fd4c4c5a9acd8345e3b74bca789bf8503445f3bf89109ae47a4.png",
    "art": "https://cdn.discordapp.com/assets/content/47b8840e428a380b1e8da83b4b93cb6ebabc8d1a3582497096c3af3d46b33814.svg",
    "milestone": "1,000 hours"
   },
   {
    "key": "visionary",
    "name": "Visionary",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/5fbabf24366e08c5f7a56219d7d39f29c41034b5bd091573600f07a904af0035.png",
    "art": "https://cdn.discordapp.com/assets/content/dea662017618e0a6986a9085d75b7a7feac1652f8d3afd63f26accb9e3b72b7f.svg",
    "milestone": "2,000 hours"
   },
   {
    "key": "phenomenon",
    "name": "Phenomenon",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/assets/content/dd20ac476f0bb7ea9a553abc699c0d6b9854a3f802187e3bf9bf2e45c37a766a.png",
    "art": "https://cdn.discordapp.com/assets/content/ffeacf283c1e7772ae35dc4d9e2ad8be2135a2c75b363d0ef32124f535670508.svg",
    "milestone": "5,000+ hours"
   }
  ]
 },
 {
  "id": 18,
  "name": "Account Age",
  "description": "Keep an active Discord account to level up this badge. Time will do the rest.",
  "leveling": "Unlock more levels by keeping your account active.",
  "rarity": 2,
  "icon": "https://cdn.discordapp.com/assets/content/4a3f89677b6a5dbcface45d639af5621a9e44a5258b961acc90701b97bb00cba.png",
  "art": "https://cdn.discordapp.com/assets/content/364b2ccf120bbf05d55c7dfdd68f80870f70d3466af8c9d8ed6215848b052e46.svg",
  "tiers": [
   {
    "key": "one_year",
    "name": "Seed",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/8da9339b9d405f0194947e607c839b1bd43436211e5bf07fe7f4ce005578e9e4.png",
    "art": "https://cdn.discordapp.com/assets/content/a020845b216d1b7ab5d32a0b65c7f706a87342546d5283b4fb7f7661e6adb5f8.svg",
    "milestone": "1 year"
   },
   {
    "key": "two_years",
    "name": "Sprout",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/f12847ebadd9022c3d67e5b31b5f3608e1ff48a222528fb6059e0fd310fc71b7.png",
    "art": "https://cdn.discordapp.com/assets/content/3ff20822dba22989ca46be81b506b0f2ae05f44a95a170d45c762d77368f81f2.svg",
    "milestone": "2 years"
   },
   {
    "key": "three_years",
    "name": "Sapling",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/dccc28b53d39406e65e76541d6b940b23a9d31ef418100d77d6eb30c4adb9098.png",
    "art": "https://cdn.discordapp.com/assets/content/b816ac430fe6fdb8a0ecf20def1ee54b2a46f202fed002d13b9c917d5deb6fec.svg",
    "milestone": "3 years"
   },
   {
    "key": "four_years",
    "name": "Bud",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/7c0a10981060861722c0216fd6c01a9fd8b10accbd3d6a04dcde275896e82e8b.png",
    "art": "https://cdn.discordapp.com/assets/content/1b97c4b817127ff54ac2247f6503d61dc01a90dfb312035ca5b5a9a94844b3b2.svg",
    "milestone": "4 years"
   },
   {
    "key": "five_years",
    "name": "Blossom",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/assets/content/52c374af536a4621a65503b4350f7459e3d00f3ed4e3b941c3902c0d9af45f4a.png",
    "art": "https://cdn.discordapp.com/assets/content/d6a94d8528bcaf8cf3270833f886acecb5b8836d4b522c940b4378a4cd99fc1c.svg",
    "milestone": "5 years"
   },
   {
    "key": "six_years",
    "name": "Redwood",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/4a3f89677b6a5dbcface45d639af5621a9e44a5258b961acc90701b97bb00cba.png",
    "art": "https://cdn.discordapp.com/assets/content/364b2ccf120bbf05d55c7dfdd68f80870f70d3466af8c9d8ed6215848b052e46.svg",
    "milestone": "6 years"
   },
   {
    "key": "seven_years",
    "name": "Sequoia",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/7c5a1b1ce27181145c7e37bf6ad323353c14e8db201cfa3cb336292ad9a5d03d.png",
    "art": "https://cdn.discordapp.com/assets/content/273839b70572100e40c68611c54463f9f45114b7a89249b96c7a4bfcc8327905.svg",
    "milestone": "7 years"
   },
   {
    "key": "eight_years",
    "name": "Bristlecone",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/53b3a2b4307df9dfc05a4c9da977baa4a6fd822f5a3d24843f949d1c93398322.png",
    "art": "https://cdn.discordapp.com/assets/content/528f91735db7fd50ed9c95b65044f911663d8941379314d01c27b8fb230fb126.svg",
    "milestone": "8 years"
   },
   {
    "key": "nine_years",
    "name": "Stromatolite",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/d30993594816cc6035041941291dc7a5862e55676ce85eef91f89fd0c59f2931.png",
    "art": "https://cdn.discordapp.com/assets/content/656dc3ca202956008e14cd1d3224f11674b372f670ffb45e22f395a48a4730e4.svg",
    "milestone": "9 years"
   },
   {
    "key": "ten_years",
    "name": "Primordial",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/assets/content/1930d04a8a1d0aba6f97b19b7e7b87158ab154ebffd5468d6ada66671285968b.png",
    "art": "https://cdn.discordapp.com/assets/content/578e40321b1d048d8f6ee125f933c993d9ad52fb0518816d3e5302ec495973a0.svg",
    "milestone": "10+ years"
   }
  ]
 },
 {
  "id": 17,
  "name": "Gifting",
  "description": "Unlocked by sending gifts to others.",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/assets/content/eb5ce89c01c7884a614b5be0ebadb0d86215b61b55c04a01d27cffb131b4a070.png",
  "art": "https://cdn.discordapp.com/assets/content/e063f16d36efcebb21c7057160081afb9c564c93b6df629c61e45613886d1aee.png",
  "tiers": [
   {
    "key": "1495878284498440192",
    "name": "Patron",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/5a2c578f82445956549c6454a2d65f8ba35b53f59120a4aa55855098ce5a653d.png",
    "art": "https://cdn.discordapp.com/assets/content/b88750c7565c6dc55140754c3de85c45809121217d3aefb842e3999f887e1931.png",
    "milestone": "1 gift"
   },
   {
    "key": "1495878348587536515",
    "name": "Champion",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/ac865fd339fbaa75d77278cd695936f168cd9b88dbbd72fdaeb76174bc0039d3.png",
    "art": "https://cdn.discordapp.com/assets/content/101d1f232a0b465978b0607e2258fbc711806858ab8255b893b164652c8533c1.png",
    "milestone": "2 gifts"
   },
   {
    "key": "1495878394632474785",
    "name": "Luminary",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/assets/content/35885be90179a2b4cc4e29aaf1285fe561c837f037aa805df40e921fd8db4867.png",
    "art": "https://cdn.discordapp.com/assets/content/8b43ae51e2e88a961420044d8c2e30316a7dc0f8c3e50d1ea1d6810bdab69fec.png",
    "milestone": "3 gifts"
   },
   {
    "key": "1495878436579840091",
    "name": "Icon",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/70b46c1ea400bc57e2d5ac937c70b7ef25599feb1c62d7817c257f19051f1460.png",
    "art": "https://cdn.discordapp.com/assets/content/9c25b98950c3a34c327b5e038ccf117f08ac150338bc39398caac7cef8038e25.png",
    "milestone": "6 gifts"
   },
   {
    "key": "1506325197932990504",
    "name": "Hero",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/assets/content/779d517e251fd2f6c4d64b4bf5839ea20cc5e061a2f971c7811ab2486ccf4553.png",
    "art": "https://cdn.discordapp.com/assets/content/ad23878cb00ef0c00e0b7484513f5e1f064b78a6f875dacc549120570f7ec87f.png",
    "milestone": "10 gifts"
   },
   {
    "key": "1506325268141314208",
    "name": "Legend",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/assets/content/eb5ce89c01c7884a614b5be0ebadb0d86215b61b55c04a01d27cffb131b4a070.png",
    "art": "https://cdn.discordapp.com/assets/content/e063f16d36efcebb21c7057160081afb9c564c93b6df629c61e45613886d1aee.png",
    "milestone": "20+ gifts"
   }
  ]
 },
 {
  "id": 12,
  "name": "Server Boosting",
  "description": "Continue Server Boosting to keep this badge.",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png",
  "art": "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png",
  "tiers": [
   {
    "key": "level_1",
    "rarity": 1,
    "icon": "https://cdn.discordapp.com/badge-icons/51040c70d4f20a921ad6674ff86fc95c.png",
    "art": "https://cdn.discordapp.com/badge-icons/51040c70d4f20a921ad6674ff86fc95c.png",
    "milestone": "1 month",
    "name": "Level 1"
   },
   {
    "key": "level_2",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/badge-icons/0e4080d1d333bc7ad29ef6528b6f2fb7.png",
    "art": "https://cdn.discordapp.com/badge-icons/0e4080d1d333bc7ad29ef6528b6f2fb7.png",
    "milestone": "2 months",
    "name": "Level 2"
   },
   {
    "key": "level_3",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/badge-icons/72bed924410c304dbe3d00a6e593ff59.png",
    "art": "https://cdn.discordapp.com/badge-icons/72bed924410c304dbe3d00a6e593ff59.png",
    "milestone": "3 months",
    "name": "Level 3"
   },
   {
    "key": "level_4",
    "rarity": 2,
    "icon": "https://cdn.discordapp.com/badge-icons/df199d2050d3ed4ebf84d64ae83989f8.png",
    "art": "https://cdn.discordapp.com/badge-icons/df199d2050d3ed4ebf84d64ae83989f8.png",
    "milestone": "6 months",
    "name": "Level 4"
   },
   {
    "key": "level_5",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/badge-icons/996b3e870e8a22ce519b3a50e6bdd52f.png",
    "art": "https://cdn.discordapp.com/badge-icons/996b3e870e8a22ce519b3a50e6bdd52f.png",
    "milestone": "9 months",
    "name": "Level 5"
   },
   {
    "key": "level_6",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/badge-icons/991c9f39ee33d7537d9f408c3e53141e.png",
    "art": "https://cdn.discordapp.com/badge-icons/991c9f39ee33d7537d9f408c3e53141e.png",
    "milestone": "12 months",
    "name": "Level 6"
   },
   {
    "key": "level_7",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/badge-icons/cb3ae83c15e970e8f3d410bc62cb8b99.png",
    "art": "https://cdn.discordapp.com/badge-icons/cb3ae83c15e970e8f3d410bc62cb8b99.png",
    "milestone": "15 months",
    "name": "Level 7"
   },
   {
    "key": "level_8",
    "rarity": 3,
    "icon": "https://cdn.discordapp.com/badge-icons/7142225d31238f6387d9f09efaa02759.png",
    "art": "https://cdn.discordapp.com/badge-icons/7142225d31238f6387d9f09efaa02759.png",
    "milestone": "18 months",
    "name": "Level 8"
   },
   {
    "key": "level_9",
    "rarity": 5,
    "icon": "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png",
    "art": "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png",
    "milestone": "24+ months",
    "name": "Level 9"
   }
  ]
 },
 {
  "id": 2,
  "name": "Discord Partner",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/3f9748e53446a137a052f3454e2de41e.png",
  "art": "https://cdn.discordapp.com/badge-icons/3f9748e53446a137a052f3454e2de41e.png",
  "tiers": []
 },
 {
  "id": 3,
  "name": "Moderator Program Alumni",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/fee1624003e2fee35cb398e125dc479b.png",
  "art": "https://cdn.discordapp.com/badge-icons/fee1624003e2fee35cb398e125dc479b.png",
  "tiers": []
 },
 {
  "id": 4,
  "name": "HypeSquad Events",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/bf01d1073931f921909045f3a39fd264.png",
  "art": "https://cdn.discordapp.com/badge-icons/bf01d1073931f921909045f3a39fd264.png",
  "tiers": []
 },
 {
  "id": 5,
  "name": "HypeSquad Bravery",
  "description": "Unlocked by taking a HypeSquad house quiz and getting sorted into Bravery.",
  "leveling": "",
  "rarity": 2,
  "icon": "https://cdn.discordapp.com/badge-icons/8a88d63823d8a71cd5e390baa45efa02.png",
  "art": "https://cdn.discordapp.com/badge-icons/8a88d63823d8a71cd5e390baa45efa02.png",
  "tiers": []
 },
 {
  "id": 6,
  "name": "HypeSquad Brilliance",
  "description": "",
  "leveling": "",
  "rarity": 2,
  "icon": "https://cdn.discordapp.com/badge-icons/011940fd013da3f7fb926e4a1cd2e618.png",
  "art": "https://cdn.discordapp.com/badge-icons/011940fd013da3f7fb926e4a1cd2e618.png",
  "tiers": []
 },
 {
  "id": 7,
  "name": "HypeSquad Balance",
  "description": "",
  "leveling": "",
  "rarity": 2,
  "icon": "https://cdn.discordapp.com/badge-icons/3aa41de486fa12454c3761e8e223442e.png",
  "art": "https://cdn.discordapp.com/badge-icons/3aa41de486fa12454c3761e8e223442e.png",
  "tiers": []
 },
 {
  "id": 8,
  "name": "Bug Hunter",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/2717692c7dca7289b35297368a940dd0.png",
  "art": "https://cdn.discordapp.com/badge-icons/2717692c7dca7289b35297368a940dd0.png",
  "tiers": []
 },
 {
  "id": 9,
  "name": "Golden Bug Hunter",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/848f79194d4be5ff5f81505cbd0ce1e6.png",
  "art": "https://cdn.discordapp.com/badge-icons/848f79194d4be5ff5f81505cbd0ce1e6.png",
  "tiers": []
 },
 {
  "id": 10,
  "name": "Early Verified Bot Developer",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/6df5892e0f35b051f8b61eace34f4967.png",
  "art": "https://cdn.discordapp.com/badge-icons/6df5892e0f35b051f8b61eace34f4967.png",
  "tiers": []
 },
 {
  "id": 11,
  "name": "Early Supporter",
  "description": "",
  "leveling": "",
  "rarity": 5,
  "icon": "https://cdn.discordapp.com/badge-icons/7060786766c9c840eb3019e725d2b358.png",
  "art": "https://cdn.discordapp.com/badge-icons/7060786766c9c840eb3019e725d2b358.png",
  "tiers": []
 },
 {
  "id": 13,
  "name": "Legacy Username",
  "description": "Unlocked with the release of the username system.",
  "leveling": "",
  "rarity": 1,
  "icon": "https://cdn.discordapp.com/badge-icons/6de6d34650760ba5551a79732e98ed60.png",
  "art": "https://cdn.discordapp.com/badge-icons/6de6d34650760ba5551a79732e98ed60.png",
  "tiers": []
 },
 {
  "id": 14,
  "name": "Quests",
  "description": "Unlocked by completing a Quest.",
  "leveling": "",
  "rarity": 1,
  "icon": "https://cdn.discordapp.com/badge-icons/7d9ae358c8c5e118768335dbe68b4fb8.png",
  "art": "https://cdn.discordapp.com/badge-icons/7d9ae358c8c5e118768335dbe68b4fb8.png",
  "tiers": []
 },
 {
  "id": 15,
  "name": "Last Meadow",
  "description": "Unlocked by participating in the 2026 Last Meadow April Fool's Day experience.",
  "leveling": "",
  "rarity": 1,
  "icon": "https://cdn.discordapp.com/badge-icons/ca105ad9cfc8580c765101d17bbb2323.png",
  "art": "https://cdn.discordapp.com/badge-icons/ca105ad9cfc8580c765101d17bbb2323.png",
  "tiers": []
 },
 {
  "id": 16,
  "name": "Orbs Apprentice",
  "description": "Unlocked with Orbs in the Shop.",
  "leveling": "",
  "rarity": 1,
  "icon": "https://cdn.discordapp.com/assets/content/d899474b7635326e96b66f7c923558af6e21e41c13e18e6c1d402efb434a4098.png",
  "art": "https://cdn.discordapp.com/assets/content/b0586bc337c189a0ca4e8f3162cc15505c3bee904befe6046a3a83e0dc8e89fd.png",
  "tiers": []
 }
];

export const dirBadge = (id: number) => DIRECTORY.find(b => b.id === id);
