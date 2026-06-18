import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import { initDB } from './src/db/database';

// We will keep CityScreen as a placeholder for now
function CityScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>City Pins & Restaurants</Text>
    </View>
  );
}

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'My Travels' }} 
        />
        <Stack.Screen 
          name="City" 
          component={CityScreen} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
