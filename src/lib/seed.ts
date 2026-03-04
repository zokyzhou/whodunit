import { connectDB } from './mongodb';
import Puzzle from '@/models/Puzzle';

const PUZZLES = [
  {
    title: 'The Elevator',
    scenario:
      'A man lives on the 15th floor of an apartment building. Every morning he takes the elevator down to the ground floor and goes to work. When he returns in the evening, he takes the elevator to the 7th floor and walks up the stairs the rest of the way — except on rainy days, when he rides all the way to the 15th floor. Why?',
    full_answer:
      "The man is very short (a little person) and can only reach the elevator button for the 7th floor. On rainy days he carries an umbrella, which he uses to press the 15th floor button. When other passengers are in the elevator, he can ask them to press 15 for him — but the puzzle's classic framing omits that detail. The key insight is his height.",
  },
  {
    title: 'The Surgeon',
    scenario:
      "A father and his son are in a terrible car accident. The father dies at the scene. The son is rushed to the hospital in critical condition. The surgeon on call looks at the boy and says, 'I cannot operate on this boy — he is my son!' How is this possible if the father is dead?",
    full_answer:
      'The surgeon is the boy\'s mother. The puzzle exploits the assumption that "surgeon" defaults to male.',
  },
  {
    title: 'The Coal, Carrot and Scarf',
    scenario:
      'In the middle of an open field, there is a hat, a carrot, several lumps of coal, and a scarf lying on the ground. No one put them there on purpose, yet they did not fall from the sky. There are no people nearby. How did these objects come to be in the field?',
    full_answer:
      'They are the remains of a snowman that melted. The coal formed the eyes and buttons, the carrot was the nose, the scarf was wrapped around the neck, and the hat sat on top.',
  },
  {
    title: 'The Music Stopped',
    scenario:
      "A woman is travelling alone on a luxury cruise ship at night. The ship's orchestra is playing in the ballroom. Suddenly the music stops — and the woman dies. She is not ill, there is no accident, and no one harms her. What happened?",
    full_answer:
      "The woman is blind. She had been using the sound of the orchestra to navigate her way along the open deck back to her cabin. When the music stopped, she lost her bearings, walked off the edge of the deck, and fell overboard into the sea.",
  },
  {
    title: 'The Locked Room',
    scenario:
      'A man is found dead, hanging from the ceiling of a locked room. The door was bolted from the inside. The only objects in the room are a puddle of water on the floor directly beneath the body and an overturned stool a few feet away. There are no windows, no other exits, and no sign of anyone else. What happened?',
    full_answer:
      'The man committed suicide. He dragged a large block of ice into the room, bolted the door, stood on the ice block, and hanged himself. The ice melted over time, leaving only the puddle of water. The overturned stool was unrelated — or placed by him beforehand as a misdirect.',
  },
];

let seeded = false;

export async function seedPuzzles() {
  if (seeded) return;
  await connectDB();

  const count = await Puzzle.countDocuments();
  if (count === 0) {
    await Puzzle.insertMany(PUZZLES);
    console.log('Seeded 5 puzzles');
  }

  seeded = true;
}
