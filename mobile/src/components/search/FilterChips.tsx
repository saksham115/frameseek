import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Spacing } from '../../constants/theme';
import Chip from '../common/Chip';

interface FilterChipsProps {
  filters: string[];
  activeFilter: string;
  onSelect: (filter: string) => void;
}

export default function FilterChips({ filters, activeFilter, onSelect }: FilterChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {filters.map((filter) => (
        <Chip
          key={filter}
          label={filter}
          active={activeFilter === filter}
          onPress={() => onSelect(filter)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
});
