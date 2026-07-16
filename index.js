const TrackPlayer = require('react-native-track-player').default;
const { radioPlaybackService } = require('./src/features/radio-player/track-player-runtime');

TrackPlayer.registerPlaybackService(() => radioPlaybackService);

require('expo-router/entry');
