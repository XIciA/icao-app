import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CourseCatalogScreen } from './AppCourseCatalogScreen';
import { builtinCourseRelease, readAvailableCourses, refreshCourses } from './course-content-repository';

export function ConnectedCourseCatalogScreen() {
  const [catalog, setCatalog] = useState(builtinCourseRelease.payload);
  const interacting = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    interacting.current = false;
    void readAvailableCourses().then(release => {
      if (active && !interacting.current) setCatalog(release.payload);
      return refreshCourses();
    }).then(release => {
      if (active && !interacting.current) setCatalog(release.payload);
    });
    return () => { active = false; };
  }, []));
  return <View style={styles.root} onTouchStart={() => { interacting.current = true; }}>
    <CourseCatalogScreen catalog={catalog} hidePrices />
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
