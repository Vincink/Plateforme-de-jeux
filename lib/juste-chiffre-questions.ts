export interface JusteChiffreQuestion {
  id: number;
  question: string;
  answer: number; // Compris entre 1 et 1000
  unit?: string;
}

export const JUSTE_CHIFFRE_QUESTIONS: JusteChiffreQuestion[] = [
  {
    id: 1,
    question: "Combien de marches faut-il gravir à pied pour atteindre le 2e étage de la Tour Eiffel ?",
    answer: 674,
    unit: "marches",
  },
  {
    id: 2,
    question: "Combien d'os compte le squelette d'un être humain adulte ?",
    answer: 206,
    unit: "os",
  },
  {
    id: 3,
    question: "Quelle est la hauteur de la Tour Eiffel, antenne comprise, en mètres ?",
    answer: 330,
    unit: "m",
  },
  {
    id: 4,
    question: "Combien de touches possède un piano standard complet ?",
    answer: 88,
    unit: "touches",
  },
  {
    id: 5,
    question: "En quelle année est né Léonard de Vinci (les 3 derniers chiffres : 1...) ?",
    answer: 452,
  },
  {
    id: 6,
    question: "Combien de minutes dure l'intégralité de la trilogie Le Seigneur des Anneaux (version cinéma) ?",
    answer: 558,
    unit: "min",
  },
  {
    id: 7,
    question: "Quelle est la vitesse maximale enregistrée d'un TGV sur rail en km/h ?",
    answer: 575,
    unit: "km/h",
  },
  {
    id: 8,
    question: "Combien de muscles compte environ le corps humain ?",
    answer: 639,
    unit: "muscles",
  },
  {
    id: 9,
    question: "Combien de départements compte la France métropolitaine ?",
    answer: 96,
    unit: "départements",
  },
  {
    id: 10,
    question: "Quelle est la profondeur maximale du lac Léman en mètres ?",
    answer: 310,
    unit: "m",
  },
  {
    id: 11,
    question: "Combien de jours dure une année sur la planète Vénus (en jours terrestres) ?",
    answer: 225,
    unit: "jours",
  },
  {
    id: 12,
    question: "Combien de films Pixar sont sortis au cinéma jusqu'en 2026 ?",
    answer: 30,
    unit: "films",
  },
  {
    id: 13,
    question: "Quelle est la longueur du pont de Brooklyn en mètres ?",
    answer: 486,
    unit: "m",
  },
  {
    id: 14,
    question: "Combien d'épisodes compte la série Friends au total ?",
    answer: 236,
    unit: "épisodes",
  },
  {
    id: 15,
    question: "Quelle est la température d'ébullition de l'éthanol pur en dixièmes de degré Celsius ?",
    answer: 784,
  },
  {
    id: 16,
    question: "Combien de Pokémon existaient dans la toute première génération ?",
    answer: 151,
    unit: "Pokémon",
  },
  {
    id: 17,
    question: "Quelle est la hauteur de l'Atomium à Bruxelles en mètres ?",
    answer: 102,
    unit: "m",
  },
  {
    id: 18,
    question: "Combien de kilomètres séparent Paris de Marseille à vol d'oiseau ?",
    answer: 660,
    unit: "km",
  },
  {
    id: 19,
    question: "Combien de grammes pèse un ballon de football officiel de la FIFA ?",
    answer: 430,
    unit: "g",
  },
  {
    id: 20,
    question: "Combien de cartes contient un jeu de Tarot français complet ?",
    answer: 78,
    unit: "cartes",
  },
  {
    id: 21,
    question: "Quelle est la hauteur du Manneken-Pis à Bruxelles en centimètres ?",
    answer: 55,
    unit: "cm",
  },
  {
    id: 22,
    question: "Combien de marches compte la montée de la Butte du Lion à Waterloo ?",
    answer: 226,
    unit: "marches",
  },
  {
    id: 23,
    question: "Combien de secondes dure un quart-temps au basket-ball NBA ?",
    answer: 720,
    unit: "s",
  },
  {
    id: 24,
    question: "Quelle est la longueur de l'avenue des Champs-Élysées en dizaines de mètres ?",
    answer: 191,
  },
  {
    id: 25,
    question: "Combien de pays sont membres de l'ONU ?",
    answer: 193,
    unit: "pays",
  },
];
