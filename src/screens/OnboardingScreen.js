import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const OnboardingScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>9:41</Text>
        <Text style={styles.statusText}>Elizian</Text>
        <Text style={styles.statusText}>100%</Text>
      </View>

      <View style={styles.content}>
        {/* Logo */}
        <Image source={require('../../assets/z.png')} style={styles.logo} />
        
        <Text style={styles.title}>Welcome to Elizian</Text>
        <Text style={styles.subtitle}>
          Earn $EZT (loyalty tokens) every time you dine at partner restaurants across India.
        </Text>

        <TouchableOpacity 
          style={styles.button}
          onPress={() => navigation.navigate('PhoneVerification')}
        >
          <Text style={styles.buttonText}>Get started</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Elizian Labs • Earn-only loyalty • India
        </Text>
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={[styles.navText, styles.activeNav]}>Home</Text>
        </View>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>🗺️</Text>
          <Text style={styles.navText}>Map</Text>
        </View>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>🎁</Text>
          <Text style={styles.navText}>Rewards</Text>
        </View>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navText}>Profile</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  statusBar: {
    height: 44,
    backgroundColor: '#000',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  statusText: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#5E17EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 28,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
  footer: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
  },
  bottomNav: {
    height: 84,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 20,
  },
  navItem: {
    alignItems: 'center',
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  navText: {
    fontSize: 12,
    color: '#666666',
  },
  activeNav: {
    color: '#5E17EB',
  },
});

export default OnboardingScreen;
