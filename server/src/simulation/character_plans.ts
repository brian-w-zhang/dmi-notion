import type { PlanBlock } from "./types.js"

// ── Plan adherence (from Big Five conscientiousness) ─────────────────────────
// Controls how strongly the plan competes vs. needs/observations each tick.
// Formula: 0.1 + (conscientiousness × 0.85)  — see planning/personality-ideas.MD

export const PLAN_ADHERENCE: Record<string, number> = {
  dwight:   0.92,
  angela:   0.91,
  stanley:  0.80,
  oscar:    0.78,
  toby:     0.72,
  phyllis:  0.68,
  pam:      0.65,
  kelly:    0.45,
  ryan:     0.42,
  michael:  0.38,
  meredith: 0.35,
  jim:      0.36,
  kevin:    0.18,
  creed:    0.13,
}

// ── Starting "currently" status ───────────────────────────────────────────────
// One-sentence living status shown above character heads and in tick context.
// Updated by agent after notable events.

export const INITIAL_CURRENTLY: Record<string, string> = {
  dwight:   "Alert and ready — completed perimeter security check, now focused on sales quota.",
  angela:   "Organized and composed — desk is impeccable, calendar reviewed.",
  oscar:    "Settled in — coffee in hand, reviewing the quarterly receivables.",
  toby:     "Quietly hoping today is uneventful.",
  pam:      "At reception, sorting the morning mail with the radio on low.",
  phyllis:  "Just arrived, exchanging pleasantries with the sales team.",
  stanley:  "At his desk. Crossword is ready. Leave him alone.",
  meredith: "Slightly rumpled, large coffee, looking forward to nothing in particular.",
  jim:      "Settling in, already scoping for an opportunity to mess with Dwight.",
  kevin:    "Found a good parking spot, considering that a win.",
  ryan:     "Arrived fashionably late, projecting an air of intentionality.",
  michael:  "Rolling in with energy, planning to make today legendary.",
  kelly:    "Bursting in with news — unclear what the news is yet.",
  creed:    "Present. Or nearby.",
}

// ── Daily plans ───────────────────────────────────────────────────────────────
// Minutes since midnight. Sim day is a typical Tuesday at Dunder Mifflin S2.
// Arrival gaps are built in — characters "arrive" at their first block.
// locationId maps to zone names Phaser resolves from office-objects.json.

const h = (hours: number, mins = 0) => hours * 60 + mins

export const CHARACTER_PLANS: Record<string, PlanBlock[]> = {

  dwight: [
    { action: "security_patrol",  description: "Patrolling the parking lot and building perimeter", locationId: "parking_lot",      emoji: "🔒", startMin: h(7,15),  durationMin: 25 },
    { action: "desk_work",        description: "Reviewing beet farm supply invoices at desk",        locationId: "dwight_desk",      emoji: "📋", startMin: h(7,40),  durationMin: 50 },
    { action: "sales_call",       description: "Making outbound sales calls — paper products",       locationId: "dwight_desk",      emoji: "📞", startMin: h(8,30),  durationMin: 90 },
    { action: "break_room",       description: "Coffee and monitoring the break room situation",     locationId: "break_room",       emoji: "☕", startMin: h(10,0),  durationMin: 15 },
    { action: "sales_call",       description: "Follow-up calls, pushing Q4 quota",                 locationId: "dwight_desk",      emoji: "📞", startMin: h(10,15), durationMin: 75 },
    { action: "lunch",            description: "Eating beet salad from home at desk",               locationId: "dwight_desk",      emoji: "🥗", startMin: h(11,30), durationMin: 30 },
    { action: "sales_call",       description: "Afternoon sales push",                              locationId: "dwight_desk",      emoji: "📞", startMin: h(12,0),  durationMin: 90 },
    { action: "report_to_michael",description: "Briefing Michael on the day's sales numbers",       locationId: "michael_office",   emoji: "📊", startMin: h(13,30), durationMin: 20 },
    { action: "sales_call",       description: "Late afternoon outbound calls",                     locationId: "dwight_desk",      emoji: "📞", startMin: h(13,50), durationMin: 90 },
    { action: "desk_work",        description: "Filing reports, updating sales tracker",            locationId: "dwight_desk",      emoji: "📁", startMin: h(15,20), durationMin: 40 },
    { action: "security_check",   description: "End-of-day perimeter and supply closet check",      locationId: "parking_lot",      emoji: "🔒", startMin: h(16,0),  durationMin: 30 },
    { action: "overtime",         description: "Staying late — more calls, more sales",             locationId: "dwight_desk",      emoji: "💼", startMin: h(16,30), durationMin: 60 },
  ],

  angela: [
    { action: "desk_setup",       description: "Organizing desk and reviewing party planning notes", locationId: "angela_desk",      emoji: "📎", startMin: h(7,50),  durationMin: 20 },
    { action: "accounting_work",  description: "Processing invoices and expense reports",           locationId: "angela_desk",      emoji: "🧾", startMin: h(8,10),  durationMin: 110 },
    { action: "party_planning",   description: "Planning the next office party — tasteful only",   locationId: "conference_room",  emoji: "🎀", startMin: h(10,0),  durationMin: 30 },
    { action: "accounting_work",  description: "Reviewing budget reconciliation",                  locationId: "angela_desk",      emoji: "📊", startMin: h(10,30), durationMin: 60 },
    { action: "lunch",            description: "Eating alone at desk — salad, precisely portioned", locationId: "angela_desk",      emoji: "🥗", startMin: h(11,30), durationMin: 30 },
    { action: "accounting_work",  description: "Auditing expense submissions",                     locationId: "angela_desk",      emoji: "🧾", startMin: h(12,0),  durationMin: 120 },
    { action: "cat_photo_review", description: "Briefly reviewing new photos of Sprinkles",        locationId: "angela_desk",      emoji: "🐱", startMin: h(14,0),  durationMin: 10 },
    { action: "accounting_work",  description: "End-of-day report preparation",                    locationId: "angela_desk",      emoji: "📁", startMin: h(14,10), durationMin: 110 },
    { action: "desk_cleanup",     description: "Straightening desk before leaving",                locationId: "angela_desk",      emoji: "✨", startMin: h(16,0),  durationMin: 20 },
  ],

  oscar: [
    { action: "settle_in",        description: "Morning coffee, checking emails",                  locationId: "oscar_desk",       emoji: "☕", startMin: h(8,45),  durationMin: 20 },
    { action: "accounting_work",  description: "Reviewing quarterly receivables",                  locationId: "oscar_desk",       emoji: "📊", startMin: h(9,5),   durationMin: 115 },
    { action: "break_room",       description: "Mid-morning coffee break",                        locationId: "break_room",       emoji: "☕", startMin: h(11,0),  durationMin: 15 },
    { action: "accounting_work",  description: "Processing vendor payments",                      locationId: "oscar_desk",       emoji: "💳", startMin: h(11,15), durationMin: 45 },
    { action: "lunch",            description: "Lunch — probably left the office",                locationId: "break_room",       emoji: "🥙", startMin: h(12,0),  durationMin: 60 },
    { action: "accounting_work",  description: "Afternoon budget analysis",                       locationId: "oscar_desk",       emoji: "📊", startMin: h(13,0),  durationMin: 120 },
    { action: "desk_work",        description: "Reconciling accounts, preparing month-end report", locationId: "oscar_desk",       emoji: "📋", startMin: h(15,0),  durationMin: 90 },
    { action: "wind_down",        description: "Wrapping up, archiving documents",                locationId: "oscar_desk",       emoji: "📁", startMin: h(16,30), durationMin: 30 },
  ],

  toby: [
    { action: "hr_review",        description: "Reviewing new HR policy updates — feels futile",   locationId: "toby_desk",        emoji: "📋", startMin: h(8,50),  durationMin: 30 },
    { action: "hr_paperwork",     description: "Processing benefits paperwork",                    locationId: "toby_desk",        emoji: "📄", startMin: h(9,20),  durationMin: 100 },
    { action: "break_room",       description: "Coffee — trying not to eavesdrop on sales floor", locationId: "break_room",       emoji: "☕", startMin: h(11,0),  durationMin: 15 },
    { action: "hr_paperwork",     description: "Drafting policy memo no one will read",           locationId: "toby_desk",        emoji: "📝", startMin: h(11,15), durationMin: 45 },
    { action: "lunch",            description: "Quiet lunch, probably outside",                   locationId: "break_room",       emoji: "🥪", startMin: h(12,0),  durationMin: 60 },
    { action: "hr_meeting",       description: "Open office hours — no one usually comes",        locationId: "toby_desk",        emoji: "🚪", startMin: h(13,0),  durationMin: 60 },
    { action: "hr_paperwork",     description: "Filing performance review documentation",         locationId: "toby_desk",        emoji: "📁", startMin: h(14,0),  durationMin: 120 },
    { action: "wind_down",        description: "Quietly finishing up, hoping Michael ignores him", locationId: "toby_desk",        emoji: "🙏", startMin: h(16,0),  durationMin: 60 },
  ],

  pam: [
    { action: "reception_setup",  description: "Booting up the phone system, sorting morning mail", locationId: "reception",       emoji: "📬", startMin: h(8,55),  durationMin: 15 },
    { action: "reception",        description: "Answering phones, greeting visitors",               locationId: "reception",       emoji: "📞", startMin: h(9,10),  durationMin: 110 },
    { action: "sketch",           description: "Sketching during a slow moment",                   locationId: "reception",       emoji: "🎨", startMin: h(11,0),  durationMin: 20 },
    { action: "reception",        description: "Back on the phones",                               locationId: "reception",       emoji: "📞", startMin: h(11,20), durationMin: 40 },
    { action: "lunch",            description: "Lunch break — often with Jim",                    locationId: "break_room",       emoji: "🥪", startMin: h(12,0),  durationMin: 60 },
    { action: "reception",        description: "Afternoon at reception",                           locationId: "reception",       emoji: "📞", startMin: h(13,0),  durationMin: 120 },
    { action: "errand",           description: "Delivering mail and packages around the office",   locationId: "office_floor",     emoji: "📦", startMin: h(15,0),  durationMin: 30 },
    { action: "reception",        description: "End of day reception coverage",                    locationId: "reception",       emoji: "📞", startMin: h(15,30), durationMin: 90 },
  ],

  phyllis: [
    { action: "settle_in",        description: "Settling in, saying good morning to everyone",    locationId: "phyllis_desk",     emoji: "😊", startMin: h(9,0),   durationMin: 15 },
    { action: "sales_call",       description: "Morning sales calls — warm, chatty approach",     locationId: "phyllis_desk",     emoji: "📞", startMin: h(9,15),  durationMin: 105 },
    { action: "break_room",       description: "Mid-morning break, catching up on gossip",        locationId: "break_room",       emoji: "☕", startMin: h(11,0),  durationMin: 20 },
    { action: "sales_call",       description: "Follow-up calls and client notes",                locationId: "phyllis_desk",     emoji: "📞", startMin: h(11,20), durationMin: 40 },
    { action: "lunch",            description: "Lunch — brought from home, shares with others",   locationId: "break_room",       emoji: "🍱", startMin: h(12,0),  durationMin: 60 },
    { action: "sales_call",       description: "Afternoon sales calls",                           locationId: "phyllis_desk",     emoji: "📞", startMin: h(13,0),  durationMin: 120 },
    { action: "desk_work",        description: "Updating client files and order tracking",        locationId: "phyllis_desk",     emoji: "📋", startMin: h(15,0),  durationMin: 60 },
    { action: "wind_down",        description: "Tidying up, saying goodbye to Bob Vance mentally",locationId: "phyllis_desk",     emoji: "🌸", startMin: h(16,0),  durationMin: 30 },
  ],

  stanley: [
    { action: "settle_in",        description: "Arriving at exactly 9:00. Coffee. Crossword.",    locationId: "stanley_desk",     emoji: "🗞️", startMin: h(9,0),   durationMin: 15 },
    { action: "sales_call",       description: "Sales calls — efficient, no-nonsense",            locationId: "stanley_desk",     emoji: "📞", startMin: h(9,15),  durationMin: 105 },
    { action: "crossword",        description: "Working on the NY Times crossword",               locationId: "stanley_desk",     emoji: "✏️", startMin: h(11,0),  durationMin: 30 },
    { action: "sales_call",       description: "Pre-lunch calls",                                 locationId: "stanley_desk",     emoji: "📞", startMin: h(11,30), durationMin: 30 },
    { action: "lunch",            description: "Lunch. Alone. Peaceful.",                         locationId: "break_room",       emoji: "🍽️", startMin: h(12,0),  durationMin: 60 },
    { action: "sales_call",       description: "Afternoon calls — counting down to 5PM",         locationId: "stanley_desk",     emoji: "📞", startMin: h(13,0),  durationMin: 120 },
    { action: "crossword",        description: "Crossword. Do not disturb.",                      locationId: "stanley_desk",     emoji: "✏️", startMin: h(15,0),  durationMin: 60 },
    { action: "wind_down",        description: "Gathering things. Leaving at 5PM. Not 5:01.",    locationId: "stanley_desk",     emoji: "🏠", startMin: h(16,45), durationMin: 15 },
  ],

  meredith: [
    { action: "settle_in",        description: "Arriving, large coffee, adjusting to being awake", locationId: "meredith_desk",   emoji: "☕", startMin: h(9,5),   durationMin: 20 },
    { action: "supplier_call",    description: "Supplier relations calls — vendor management",    locationId: "meredith_desk",    emoji: "📞", startMin: h(9,25),  durationMin: 95 },
    { action: "break_room",       description: "Break room visit",                                locationId: "break_room",       emoji: "🧃", startMin: h(11,0),  durationMin: 20 },
    { action: "supplier_call",    description: "More vendor calls",                               locationId: "meredith_desk",    emoji: "📞", startMin: h(11,20), durationMin: 40 },
    { action: "lunch",            description: "Long lunch — off-site",                           locationId: "break_room",       emoji: "🍺", startMin: h(12,0),  durationMin: 90 },
    { action: "supplier_call",    description: "Afternoon supplier follow-ups",                   locationId: "meredith_desk",    emoji: "📞", startMin: h(13,30), durationMin: 90 },
    { action: "desk_work",        description: "Filing supplier agreements",                      locationId: "meredith_desk",    emoji: "📁", startMin: h(15,0),  durationMin: 60 },
    { action: "wind_down",        description: "Wrapping up loosely",                             locationId: "meredith_desk",    emoji: "🌀", startMin: h(16,0),  durationMin: 30 },
  ],

  jim: [
    { action: "settle_in",        description: "Arriving, getting coffee, eyeing Dwight",         locationId: "jim_desk",         emoji: "😏", startMin: h(9,10),  durationMin: 20 },
    { action: "sales_call",       description: "Morning sales calls — easygoing but effective",   locationId: "jim_desk",         emoji: "📞", startMin: h(9,30),  durationMin: 60 },
    { action: "prank_planning",   description: "Planning something for Dwight",                   locationId: "jim_desk",         emoji: "😈", startMin: h(10,30), durationMin: 20 },
    { action: "sales_call",       description: "More calls",                                      locationId: "jim_desk",         emoji: "📞", startMin: h(10,50), durationMin: 40 },
    { action: "chat_pam",         description: "Hanging out at Pam's reception desk",             locationId: "reception",        emoji: "😄", startMin: h(11,30), durationMin: 30 },
    { action: "lunch",            description: "Lunch — usually with Pam",                        locationId: "break_room",       emoji: "🥙", startMin: h(12,0),  durationMin: 60 },
    { action: "sales_call",       description: "Afternoon calls — gets more done than it seems",  locationId: "jim_desk",         emoji: "📞", startMin: h(13,0),  durationMin: 90 },
    { action: "prank_execution",  description: "Executing the prank on Dwight",                   locationId: "office_floor",     emoji: "😂", startMin: h(14,30), durationMin: 30 },
    { action: "sales_call",       description: "Late afternoon calls",                            locationId: "jim_desk",         emoji: "📞", startMin: h(15,0),  durationMin: 60 },
    { action: "wind_down",        description: "Leaving roughly on time, no overtime",            locationId: "jim_desk",         emoji: "🚪", startMin: h(16,0),  durationMin: 30 },
  ],

  kevin: [
    { action: "settle_in",        description: "Arriving, getting a big snack from the kitchen",  locationId: "kevin_desk",       emoji: "🍩", startMin: h(9,15),  durationMin: 20 },
    { action: "accounting_work",  description: "Working through accounting tasks slowly",         locationId: "kevin_desk",       emoji: "🔢", startMin: h(9,35),  durationMin: 85 },
    { action: "break_room",       description: "Snack time",                                      locationId: "break_room",       emoji: "🍪", startMin: h(11,0),  durationMin: 25 },
    { action: "accounting_work",  description: "More accounting — it takes a while",              locationId: "kevin_desk",       emoji: "📊", startMin: h(11,25), durationMin: 35 },
    { action: "lunch",            description: "Large lunch — enthusiastic about this",           locationId: "break_room",       emoji: "🍔", startMin: h(12,0),  durationMin: 60 },
    { action: "accounting_work",  description: "Post-lunch accounting, fighting drowsiness",      locationId: "kevin_desk",       emoji: "😪", startMin: h(13,0),  durationMin: 120 },
    { action: "break_room",       description: "Another snack",                                   locationId: "break_room",       emoji: "🧀", startMin: h(15,0),  durationMin: 15 },
    { action: "accounting_work",  description: "Finishing up — mostly done",                     locationId: "kevin_desk",       emoji: "✅", startMin: h(15,15), durationMin: 60 },
    { action: "wind_down",        description: "Thinking about dinner",                           locationId: "kevin_desk",       emoji: "🍝", startMin: h(16,15), durationMin: 30 },
  ],

  ryan: [
    { action: "settle_in",        description: "Arriving coolly, setting up the temp desk",       locationId: "ryan_desk",        emoji: "💼", startMin: h(9,20),  durationMin: 20 },
    { action: "data_entry",       description: "Data entry work — beneath him, but he does it",   locationId: "ryan_desk",        emoji: "💻", startMin: h(9,40),  durationMin: 80 },
    { action: "break_room",       description: "Coffee, looking at his phone",                    locationId: "break_room",       emoji: "📱", startMin: h(11,0),  durationMin: 20 },
    { action: "data_entry",       description: "More data entry",                                 locationId: "ryan_desk",        emoji: "💻", startMin: h(11,20), durationMin: 40 },
    { action: "lunch",            description: "Lunch — probably skips out early",                locationId: "break_room",       emoji: "🥗", startMin: h(12,0),  durationMin: 70 },
    { action: "data_entry",       description: "Afternoon data work",                             locationId: "ryan_desk",        emoji: "💻", startMin: h(13,10), durationMin: 110 },
    { action: "networking",       description: "Pretending to research business school options",  locationId: "ryan_desk",        emoji: "🎓", startMin: h(15,0),  durationMin: 60 },
    { action: "wind_down",        description: "Leaving — has somewhere to be",                   locationId: "ryan_desk",        emoji: "🚀", startMin: h(16,0),  durationMin: 30 },
  ],

  michael: [
    { action: "grand_entrance",   description: "Arriving with energy — today is going to be great", locationId: "michael_office", emoji: "🌟", startMin: h(9,30),  durationMin: 20 },
    { action: "desk_work",        description: "Glancing at reports, mostly thinking about fun",   locationId: "michael_office",  emoji: "📋", startMin: h(9,50),  durationMin: 40 },
    { action: "wander_office",    description: "Walking the floor, checking in with employees",   locationId: "office_floor",     emoji: "😁", startMin: h(10,30), durationMin: 30 },
    { action: "phone_call",       description: "Call with Jan or corporate",                      locationId: "michael_office",   emoji: "📞", startMin: h(11,0),  durationMin: 30 },
    { action: "wander_office",    description: "Bothering people with questions",                 locationId: "office_floor",     emoji: "🗣️", startMin: h(11,30), durationMin: 30 },
    { action: "lunch",            description: "Long lunch, either alone or with the team",       locationId: "break_room",       emoji: "🍕", startMin: h(12,0),  durationMin: 90 },
    { action: "meeting",          description: "Calling an unnecessary meeting",                  locationId: "conference_room",  emoji: "📢", startMin: h(13,30), durationMin: 60 },
    { action: "desk_work",        description: "Actually doing some manager work",                locationId: "michael_office",   emoji: "💼", startMin: h(14,30), durationMin: 60 },
    { action: "wander_office",    description: "Afternoon morale boost — his words",              locationId: "office_floor",     emoji: "🎉", startMin: h(15,30), durationMin: 60 },
    { action: "wind_down",        description: "Last-minute tasks, telling people goodnight",     locationId: "michael_office",   emoji: "🌙", startMin: h(16,30), durationMin: 30 },
  ],

  kelly: [
    { action: "arrive_chat",      description: "Bursting in with news about something",           locationId: "kelly_desk",       emoji: "💬", startMin: h(9,35),  durationMin: 25 },
    { action: "customer_service", description: "Customer service calls — very enthusiastic",      locationId: "kelly_desk",       emoji: "📞", startMin: h(10,0),  durationMin: 60 },
    { action: "break_room",       description: "Social time — talking, not really on break",      locationId: "break_room",       emoji: "💅", startMin: h(11,0),  durationMin: 30 },
    { action: "customer_service", description: "More customer calls",                             locationId: "kelly_desk",       emoji: "📞", startMin: h(11,30), durationMin: 30 },
    { action: "lunch",            description: "Lunch with whoever will listen",                  locationId: "break_room",       emoji: "🥡", startMin: h(12,0),  durationMin: 60 },
    { action: "customer_service", description: "Afternoon customer service",                      locationId: "kelly_desk",       emoji: "📞", startMin: h(13,0),  durationMin: 90 },
    { action: "gossip",           description: "Circulating the latest office gossip",            locationId: "office_floor",     emoji: "🗣️", startMin: h(14,30), durationMin: 30 },
    { action: "customer_service", description: "End of day customer calls",                       locationId: "kelly_desk",       emoji: "📞", startMin: h(15,0),  durationMin: 60 },
    { action: "wind_down",        description: "Getting ready to leave, debating what to do tonight", locationId: "kelly_desk",   emoji: "✨", startMin: h(16,0),  durationMin: 30 },
  ],

  creed: [
    { action: "arrive_mysterious","description": "Creed arrives. Nobody saw him come in.",        locationId: "creed_desk",       emoji: "👁️", startMin: h(9,0),   durationMin: 30 },
    { action: "desk_work",        description: "Quality assurance — unclear what this means",     locationId: "creed_desk",       emoji: "🔍", startMin: h(9,30),  durationMin: 90 },
    { action: "break_room",       description: "In the break room — doing something",             locationId: "break_room",       emoji: "🧃", startMin: h(11,0),  durationMin: 30 },
    { action: "desk_work",        description: "Back at desk. Possibly sleeping.",                locationId: "creed_desk",       emoji: "💤", startMin: h(11,30), durationMin: 30 },
    { action: "lunch",            description: "Lunch — off-site, nobody asks where",            locationId: "break_room",       emoji: "🌮", startMin: h(12,0),  durationMin: 90 },
    { action: "desk_work",        description: "Afternoon presence",                              locationId: "creed_desk",       emoji: "👁️", startMin: h(13,30), durationMin: 150 },
    { action: "wind_down",        description: "Creed leaves before the end of the day.",        locationId: "creed_desk",       emoji: "🌫️", startMin: h(16,0),  durationMin: 30 },
  ],

}
