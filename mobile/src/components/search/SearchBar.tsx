import React, { useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onClear?: () => void;
}

export default function SearchBar({ value, onChangeText, onSubmit, placeholder = 'Search your videos...', autoFocus, onClear }: SearchBarProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit?.(value.trim());
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={handleSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => { onChangeText(''); onClear?.(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={20} color={colors.textMid} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={handleSubmit}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.searchButton, { backgroundColor: value.trim() ? colors.amber : colors.border }]}
      >
        <Ionicons name="search" size={18} color={value.trim() ? '#fff' : colors.textDim} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
  },
  searchButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
