import { connectDB } from './mongodb';
import Puzzle from '@/models/Puzzle';

const PUZZLES = [
  {
    title: 'The Elevator',
    scenario:
      'Every weekday, Marcus leaves his apartment, steps into the elevator, and presses the button for the ground floor without hesitation. In the evenings he returns, enters the same elevator, and — if the car is empty and no one else boards — rides only to the 8th floor of his 24-storey building, then climbs the remaining sixteen flights on foot. He is in perfect health, the elevator is fully functional, and all buttons work. On stormy evenings, and only then, he rides straight to the 24th floor. His neighbours find the habit bizarre. Why does he do it?',
    full_answer:
      "Marcus is very short — a little person — and cannot reach the buttons above the 8th floor. On stormy evenings he carries a long umbrella, which he uses to press the 24th-floor button. When neighbours share the elevator he asks them to press it for him, so the pattern only appears when he rides alone without an umbrella.",
  },
  {
    title: 'The Surgeon',
    scenario:
      "Two ambulances arrive at the hospital three minutes apart. The first carries a man pronounced dead on arrival — the victim of a highway collision. The second carries the man's teenage son, critically injured in the same crash. The boy is rushed into the operating theatre. The senior surgeon on duty takes one look at the patient, steps back, and says quietly: \"I can't operate on this boy.\" The junior staff are stunned — there is no conflict of interest on record, the surgeon has no prior relationship with the family, and the boy will die without immediate intervention. What is going on?",
    full_answer:
      "The surgeon is the boy's mother. The scenario relies on the implicit assumption that surgeons are male. Once that assumption is dropped, the surgeon's refusal makes sense: she is too emotionally compromised to operate on her own child.",
  },
  {
    title: 'The Coal, Carrot and Scarf',
    scenario:
      "A farmer crosses his own field one February morning and finds a wool scarf, a handful of coal lumps, a stubby orange vegetable, and a battered top hat lying in a rough cluster on the frozen ground. There are no tracks in the frost leading to or from the items. The objects do not belong to the farmer, no vehicle could have reached that spot, and the field has no trees or structures from which anything could have fallen. The farmer looks at the cluster for a moment, smiles, and walks on — entirely unsurprised. What had been there?",
    full_answer:
      'A snowman had been built in that spot and subsequently melted. The coal pieces were its eyes and buttons, the carrot its nose, the scarf wrapped around its neck, and the top hat placed on its head. As the snow melted away the accessories were left behind in a pile, with no footprints remaining in the now-frozen mud.',
  },
  {
    title: 'The Music Stopped',
    scenario:
      "The SS Adriatic is three days into a transatlantic crossing. At 11:40 pm the ship's string quartet, playing in the first-class lounge, finishes its last set and packs away their instruments. The lounge empties. On the promenade deck outside, a woman who had booked the voyage alone collapses against the railing and, seconds later, is gone. The sea is calm, the ship stable, the woman had eaten dinner without incident and had been seen by other passengers looking perfectly well an hour before. No alarm was raised until morning. What happened?",
    full_answer:
      "The woman was blind and had been using the faint sound of the quartet filtering through the lounge windows to orient herself as she walked along the dark promenade deck toward her cabin. When the music abruptly stopped she lost her only navigational reference, became disoriented at the railing, and fell overboard. Because she disappeared silently in the dark, no one witnessed the fall.",
  },
  {
    title: 'The Locked Room',
    scenario:
      "Police respond to a welfare check on the 6th floor of an apartment block. They break down the door — the only entrance — and find a man dead, suspended from a ceiling beam by a length of rope. The room is warm, the windows sealed shut and latched from inside, and the door had been bolted from the inside with a slide-bolt that cannot be operated from outside. There is no chair, no ladder, no furniture tall enough to have served as a platform — only a small wooden stool lying on its side three metres from the body, and a damp patch on the floorboards directly beneath the man's feet. No one else is in the room. How did he die, and how did he reach the beam?",
    full_answer:
      "The man stood on a large block of ice to reach the beam and tie the rope, then waited for the ice to melt. The block had fully melted by the time the body was found, leaving only the damp patch on the floor. The stool was a red herring — he had knocked it over earlier in the day for an unrelated reason.",
  },
];

export async function seedPuzzles() {
  await connectDB();

  for (const puzzle of PUZZLES) {
    await Puzzle.updateOne(
      { title: puzzle.title },
      { $set: { scenario: puzzle.scenario, full_answer: puzzle.full_answer } },
      { upsert: true }
    );
  }
}
