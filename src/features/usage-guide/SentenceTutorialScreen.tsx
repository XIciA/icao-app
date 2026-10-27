import { Redirect } from 'expo-router';
/** Old deep links now open the guide; no separate sample session exists. */
export function SentenceTutorialScreen() { return <Redirect href="/info/guide" />; }
