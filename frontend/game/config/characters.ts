export type CharacterOwner =
  | 'michael'
  | 'dwight'
  | 'jim'
  | 'pam'
  | 'ryan'
  | 'kelly'
  | 'angela'
  | 'oscar'
  | 'kevin'
  | 'stanley'
  | 'phyllis'
  | 'meredith'
  | 'creed'
  | 'toby';

export interface CharacterAssetDef {
  owner: CharacterOwner;
  displayName: string;
  spriteKey: string;
  spritePath: string;
  isPlayerControlled: boolean;
}

export const CHARACTER_ASSETS: CharacterAssetDef[] = [
  {
    owner: 'michael',
    displayName: 'Michael Scott',
    spriteKey: 'michael-scott',
    spritePath: '/assets/sprites/michael scott.png',
    isPlayerControlled: false,
  },
  {
    owner: 'dwight',
    displayName: 'Dwight Schrute',
    spriteKey: 'dwight-schrute',
    spritePath: '/assets/sprites/dwight schrute.png',
    isPlayerControlled: true,
  },
  {
    owner: 'jim',
    displayName: 'Jim Halpert',
    spriteKey: 'jim-halpert',
    spritePath: '/assets/sprites/jim halpert.png',
    isPlayerControlled: false,
  },
  {
    owner: 'pam',
    displayName: 'Pam Beesly',
    spriteKey: 'pam-beesly',
    spritePath: '/assets/sprites/pam beesly.png',
    isPlayerControlled: false,
  },
  {
    owner: 'ryan',
    displayName: 'Ryan Howard',
    spriteKey: 'ryan-howard',
    spritePath: '/assets/sprites/ryan howard.png',
    isPlayerControlled: false,
  },
  {
    owner: 'kelly',
    displayName: 'Kelly Kapoor',
    spriteKey: 'kelly-kapoor',
    spritePath: '/assets/sprites/kelly kapoor.png',
    isPlayerControlled: false,
  },
  {
    owner: 'angela',
    displayName: 'Angela Martin',
    spriteKey: 'angela-martin',
    spritePath: '/assets/sprites/angela martin.png',
    isPlayerControlled: false,
  },
  {
    owner: 'oscar',
    displayName: 'Oscar Martinez',
    spriteKey: 'oscar-martinez',
    spritePath: '/assets/sprites/oscar martinez.png',
    isPlayerControlled: false,
  },
  {
    owner: 'kevin',
    displayName: 'Kevin Malone',
    spriteKey: 'kevin-malone',
    spritePath: '/assets/sprites/kevin malone.png',
    isPlayerControlled: false,
  },
  {
    owner: 'stanley',
    displayName: 'Stanley Hudson',
    spriteKey: 'stanley-hudson',
    spritePath: '/assets/sprites/stanley hudson.png',
    isPlayerControlled: false,
  },
  {
    owner: 'phyllis',
    displayName: 'Phyllis Lapin',
    spriteKey: 'phyllis-lapin',
    spritePath: '/assets/sprites/phyllis lapin.png',
    isPlayerControlled: false,
  },
  {
    owner: 'meredith',
    displayName: 'Meredith Palmer',
    spriteKey: 'meredith-palmer',
    spritePath: '/assets/sprites/meredith palmer.png',
    isPlayerControlled: false,
  },
  {
    owner: 'creed',
    displayName: 'Creed Bratton',
    spriteKey: 'creed-bratton',
    spritePath: '/assets/sprites/creed bratton.png',
    isPlayerControlled: false,
  },
  {
    owner: 'toby',
    displayName: 'Toby Flenderson',
    spriteKey: 'toby-flenderson',
    spritePath: '/assets/sprites/toby flenderson.png',
    isPlayerControlled: false,
  },
];
