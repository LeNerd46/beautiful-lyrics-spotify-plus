import { ExtensionSetting, SpotifyPlus } from 'spotifyplus';
import App from './app';

SpotifyPlus.Surfaces.register('lyrics-view', (surface: any) => {
    return <App />
});

SpotifyPlus.Settings.registerSettings([
    {
        title: 'Test',
        items: [
            {
                id: 'test-1',
                label: 'Test Setting',
                type: 'toggle',
                value: false
            },
            {
                id: 'test-2',
                label: 'Other Test Setting',
                type: 'slider',
                min: 0,
                max: 100,
                value: 50
            },
            {
                id: 'test-3',
                label: 'Another Test Setting',
                type: 'date',
                value: '2026-07-24'
            },
            {
                id: 'test-4',
                label: 'Dropdown Test',
                type: 'select',
                options: [
                    {
                        label: 'Option 1',
                        description: 'This is a description',
                        value: 'option-1'
                    },
                    {
                        label: 'Option 2',
                        value: 'option-2'
                    }
                ],
                value: 'option-1'
            }
        ]
    }
]);

const handleChange = (setting: ExtensionSetting) => {
    console.log(setting);
};

SpotifyPlus.Events.on('settings.changed', handleChange);