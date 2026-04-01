import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Text, View, Platform } from 'react-native';

import TodayScreen from './src/screens/TodayScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import { COLORS, RADIUS, SHADOW } from './src/constants/theme';

const Tab = createBottomTabNavigator();

function TabIcon({ emoji, focused }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Tab.Navigator
            screenOptions={{
              headerStyle: {
                backgroundColor: COLORS.surface,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
                elevation: 0,
                shadowOpacity: 0,
              },
              headerTitleStyle: {
                fontSize: 17,
                fontWeight: '700',
                color: COLORS.text,
              },
              tabBarStyle: {
                display: 'none',    // We embed the tab bar look in the toolbar
              },
              tabBarActiveTintColor: COLORS.primary,
              tabBarInactiveTintColor: COLORS.textMuted,
            }}
          >
            <Tab.Screen
              name="Today"
              component={TodayScreen}
              options={{
                title: 'Daily Tasks',
                tabBarIcon: ({ focused }) => <TabIcon emoji="✅" focused={focused} />,
                tabBarLabel: 'Tasks',
              }}
            />
            <Tab.Screen
              name="Analytics"
              component={AnalyticsScreen}
              options={{
                title: 'Analytics',
                tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
                tabBarLabel: 'Analytics',
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabIcon: {
    padding: 4,
    borderRadius: RADIUS.sm,
  },
  tabIconFocused: {
    backgroundColor: COLORS.primaryLight,
  },
  tabEmoji: {
    fontSize: 20,
  },
});
