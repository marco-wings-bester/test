import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { COLORS, SPACING, RADIUS, SHADOW } from '../constants/theme';

const PULSE_DURATION = 800;

export default function RecordButton({ onRecordingComplete, disabled }) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);   // seconds
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

  // Pulsing animation for the recording indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: PULSE_DURATION, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: PULSE_DURATION, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      clearInterval(timerRef.current);
      stopPulse();
    };
  }, [stopPulse]);

  const requestPermissions = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Microphone Permission Required',
        'Please grant microphone access in Settings to record voice tasks.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled) return;
    const granted = await requestPermissions();
    if (!granted) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);
      startPulse();

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      Alert.alert('Recording Error', err.message);
    }
  }, [disabled, requestPermissions, startPulse]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    clearInterval(timerRef.current);
    stopPulse();
    setIsRecording(false);
    setDuration(0);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (uri) {
        onRecordingComplete({ uri, mimeType: 'audio/m4a' });
      }
    } catch (err) {
      recordingRef.current = null;
      Alert.alert('Recording Error', `Failed to stop recording: ${err.message}`);
    }
  }, [stopPulse, onRecordingComplete]);

  const handlePress = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, stopRecording, startRecording]);

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <View style={styles.container}>
      {isRecording && (
        <Text style={styles.durationText}>{formatDuration(duration)}</Text>
      )}

      {/* Outer pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          isRecording && styles.pulseRingActive,
          { transform: [{ scale: isRecording ? pulseAnim : 1 }] },
        ]}
      />

      {/* Main button */}
      <TouchableOpacity
        style={[
          styles.button,
          isRecording && styles.buttonRecording,
          disabled && styles.buttonDisabled,
        ]}
        onPress={handlePress}
        activeOpacity={0.85}
        disabled={disabled}
      >
        {isRecording ? (
          <View style={styles.stopIcon} />
        ) : (
          <Text style={styles.micIcon}>🎙</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>
        {isRecording ? 'Tap to stop' : 'Hold to record'}
      </Text>
    </View>
  );
}

const BTN_SIZE = 72;
const RING_SIZE = BTN_SIZE + 20;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.recording,
    marginBottom: SPACING.sm,
    letterSpacing: 1,
  },
  pulseRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: 'transparent',
  },
  pulseRingActive: {
    backgroundColor: COLORS.recordingGlow,
  },
  button: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.large,
  },
  buttonRecording: {
    backgroundColor: COLORS.recording,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  micIcon: {
    fontSize: 30,
  },
  stopIcon: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: COLORS.surface,
  },
  label: {
    marginTop: SPACING.sm,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
