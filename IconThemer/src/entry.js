import { register } from '../../src/runtime.js';
import factory from './plugin.js';
import manifest from '../manifest.json' with { type: 'json' };
export default register({ id: manifest.id, name: manifest.display.name, version: manifest.version, authors: manifest.display.authors }, factory);
