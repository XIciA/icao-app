const TrackPlayer = require('react-native-track-player').default;
const { radioPlaybackService } = require('../features/radio-player/track-player-runtime');

TrackPlayer.registerPlaybackService(() => radioPlaybackService);
