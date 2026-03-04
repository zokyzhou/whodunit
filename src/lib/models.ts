// Import all models so Mongoose registers their schemas before any populate() call.
// Include this in every route handler that touches the database.
import '@/models/Agent';
import '@/models/Puzzle';
import '@/models/Room';
