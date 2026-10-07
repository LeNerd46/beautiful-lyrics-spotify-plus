import { ExtensionSetting, SpotifyPlus } from 'spotifyplus';
import App from './app';

SpotifyPlus.UI.replace('lyrics.page', () => <App />);
// SpotifyPlus.Surfaces.register('lyrics-view', (surface: any) => {
//     return <App />
// });