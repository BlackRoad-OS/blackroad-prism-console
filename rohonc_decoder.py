#!/usr/bin/env python3
"""
Rohonc Codex Decoder
Uses KJV Bible as a comprehensive cipher key
Implements multiple decoding strategies
"""

import re
import json
from collections import defaultdict, Counter
import itertools


def _make_logger(verbose: bool):
    """Return a callable that prints conditionally."""

    def _log(message=""):
        if verbose:
            print(message)

    return _log

class RohoncDecoder:
    def __init__(self, bible_file='bible_full.txt', numbers_file='bible_numbers.txt', *, verbose=False):
        """Initialize decoder with Bible text and numbers"""
        self.verbose = verbose
        self._log = _make_logger(verbose)

        # Load Bible text
        with open(bible_file, 'r', encoding='utf-8') as f:
            self.bible_text = f.read()

        # Load Bible numbers
        with open(numbers_file, 'r') as f:
            self.bible_numbers = [int(line.strip()) for line in f if line.strip()]
        
        self._log(f"Loaded {len(self.bible_text)} chars and {len(self.bible_numbers)} numbers")
        
        # Build lookup tables
        self.build_lookup_tables()
    
    def build_lookup_tables(self):
        """Build comprehensive lookup tables for decoding"""
        
        # 1. Position-to-character mapping (every character at every position)
        self.position_map = {}
        for i, char in enumerate(self.bible_text):
            self.position_map[i] = char
        
        # 2. Number-to-character mapping (using Bible numbers as indices)
        self.number_char_map = {}
        for i, num in enumerate(self.bible_numbers):
            if num < len(self.bible_text):
                self.number_char_map[num] = self.bible_text[num]
        
        # 3. Verse-based lookup (verse number -> text)
        self.verse_map = self.extract_verses()
        
        # 4. Word frequency table
        words = re.findall(r'\b[A-Za-z]+\b', self.bible_text)
        self.word_freq = Counter(words)
        self.words_by_length = defaultdict(list)
        for word in set(words):
            self.words_by_length[len(word)].append(word)
        
        self._log(f"Built lookup tables: {len(self.verse_map)} verses, {len(self.word_freq)} unique words")
    
    def extract_verses(self):
        """Extract verse structure from Bible"""
        verses = {}
        current_chapter = 0
        
        lines = self.bible_text.split('\n')
        for line in lines:
            # Check for chapter marker
            chapter_match = re.match(r'^Chapter (\d+)', line)
            if chapter_match:
                current_chapter = int(chapter_match.group(1))
                continue
            
            # Extract verse
            verse_match = re.match(r'^(\d+)(.+)', line)
            if verse_match and current_chapter > 0:
                verse_num = int(verse_match.group(1))
                verse_text = verse_match.group(2).strip()
                key = f"{current_chapter}:{verse_num}"
                verses[key] = verse_text
        
        return verses
    
    def decode_number_sequence(self, number_sequence):
        """
        Decode a sequence of numbers using Bible as key
        Each number maps to a position or character in Bible
        """
        decoded = []
        
        for num in number_sequence:
            # Try multiple interpretation methods
            
            # Method 1: Direct position lookup
            if num < len(self.bible_text):
                decoded.append(self.bible_text[num])
            
            # Method 2: Use as index into Bible numbers array
            elif num < len(self.bible_numbers):
                bible_pos = self.bible_numbers[num]
                if bible_pos < len(self.bible_text):
                    decoded.append(self.bible_text[bible_pos])
        
        return ''.join(decoded)
    
    def decode_with_caesar_partition(self, encoded_text, partition_size=256, shift=18):
        """
        Decode text using Caesar cipher with specified partition size
        partition_size: 256 for extended ASCII, 26 for alphabet
        shift: 18 (as specified)
        """
        decoded = []
        
        for char in encoded_text:
            if partition_size == 256:
                # Extended ASCII Caesar
                ascii_val = ord(char)
                shifted = (ascii_val - shift) % 256
                decoded.append(chr(shifted))
            else:  # partition_size == 26
                # Standard alphabet Caesar
                if char.isalpha():
                    base = ord('A') if char.isupper() else ord('a')
                    shifted = (ord(char) - base - shift) % 26
                    decoded.append(chr(base + shifted))
                else:
                    decoded.append(char)
        
        return ''.join(decoded)
    
    def giant_word_search(self, pattern_length=10, stride=1):
        """
        Implement 'giant word search' across Bible
        Extract all subsequences of given length
        Returns frequency analysis of patterns
        """
        patterns = Counter()
        
        # Extract all patterns of specified length
        for i in range(0, len(self.bible_text) - pattern_length, stride):
            pattern = self.bible_text[i:i+pattern_length]
            # Only count alphabetic patterns
            if pattern.replace(' ', '').isalpha():
                patterns[pattern] += 1
        
        return patterns.most_common(100)
    
    def correlate_rohonc_bible(self, rohonc_symbols):
        """
        Correlate Rohonc symbol frequencies with Bible character frequencies
        This helps identify which Rohonc symbols might map to common Bible characters
        """
        # Bible character frequency
        bible_freq = Counter(self.bible_text.lower())
        
        # Rohonc symbol frequency (you would provide actual symbol data)
        rohonc_freq = Counter(rohonc_symbols)
        
        # Sort by frequency
        bible_sorted = [item[0] for item in bible_freq.most_common(50)]
        rohonc_sorted = [item[0] for item in rohonc_freq.most_common(50)]
        
        # Create potential mapping
        potential_mapping = {}
        for i in range(min(len(bible_sorted), len(rohonc_sorted))):
            potential_mapping[rohonc_sorted[i]] = bible_sorted[i]
        
        return potential_mapping
    
    def extract_numeric_patterns(self):
        """
        Extract all numeric patterns from Bible for pattern matching
        Returns sequences that might be keys
        """
        patterns = {
            'consecutive_sequences': [],
            'repeating_patterns': [],
            'arithmetic_sequences': [],
            'geometric_sequences': []
        }
        
        # Find consecutive number sequences
        for i in range(len(self.bible_numbers) - 5):
            seq = self.bible_numbers[i:i+6]
            # Check if consecutive
            if all(seq[j+1] - seq[j] == 1 for j in range(len(seq)-1)):
                patterns['consecutive_sequences'].append(seq)
        
        # Find repeating patterns
        for i in range(len(self.bible_numbers) - 3):
            pattern = tuple(self.bible_numbers[i:i+3])
            # Check if this pattern repeats
            count = 0
            for j in range(i+3, len(self.bible_numbers)-2):
                if tuple(self.bible_numbers[j:j+3]) == pattern:
                    count += 1
            if count > 0:
                patterns['repeating_patterns'].append((pattern, count))
        
        return patterns
    
    def bible_coordinates_to_text(self, coordinates):
        """
        Convert Bible coordinates (book, chapter, verse, word) to actual text
        Format: [(1, 1, 1, 1), (1, 1, 1, 2), ...]
        """
        text_pieces = []
        
        for coord in coordinates:
            # For now, use chapter:verse format
            if len(coord) >= 2:
                chapter, verse = coord[0], coord[1]
                key = f"{chapter}:{verse}"
                if key in self.verse_map:
                    verse_text = self.verse_map[key]
                    words = verse_text.split()
                    if len(coord) >= 3 and coord[2] < len(words):
                        text_pieces.append(words[coord[2]])
                    else:
                        text_pieces.append(verse_text)
        
        return ' '.join(text_pieces)
    
    def reverse_cipher_key_search(self, known_plaintext, known_ciphertext):
        """
        If we know both plaintext and ciphertext from Rohonc,
        deduce which Bible numbers were used as the key
        """
        potential_keys = []
        
        for i in range(len(known_plaintext)):
            p_char = ord(known_plaintext[i])
            c_char = ord(known_ciphertext[i])
            
            # Calculate shift for this position
            shift = (c_char - p_char) % 256
            
            # Find which Bible numbers equal this shift
            matching_numbers = [
                (idx, num) for idx, num in enumerate(self.bible_numbers) 
                if num == shift
            ]
            
            potential_keys.append(matching_numbers)
        
        return potential_keys
    
    def polyalphabetic_decode(self, ciphertext, key_length=10):
        """
        Decode using Bible numbers as polyalphabetic cipher key
        """
        # Use first key_length Bible numbers as the key
        key = self.bible_numbers[:key_length]
        
        decoded = []
        for i, char in enumerate(ciphertext):
            if char.isalpha():
                shift = key[i % len(key)]
                base = ord('A') if char.isupper() else ord('a')
                decoded_char = chr((ord(char) - base - shift) % 26 + base)
                decoded.append(decoded_char)
            else:
                decoded.append(char)
        
        return ''.join(decoded)

def main():
    """Run Rohonc decoder demonstrations"""
    print("="*70)
    print("ROHONC CODEX DECODER - BIBLE CIPHER KEY SYSTEM")
    print("="*70)
    
    decoder = RohoncDecoder()
    
    print("\n1. DECODE NUMBER SEQUENCE")
    print("-" * 70)
    # Example: if Rohonc contains number sequence
    test_numbers = [100, 200, 300, 400, 500, 1000, 1500, 2000]
    decoded = decoder.decode_number_sequence(test_numbers)
    print(f"Test sequence: {test_numbers}")
    print(f"Decoded text: {repr(decoded)}")
    
    print("\n2. CAESAR CIPHER DECODE (256 partition, shift 18)")
    print("-" * 70)
    # If Rohonc text is Caesar encrypted
    test_cipher = "[\\x802\\x86zw2twy{\\x80\\x80{\\x80y2Y\\x81v2u\\x84ws\\x86wv"
    decoded_256 = decoder.decode_with_caesar_partition(test_cipher, 256, 18)
    print(f"Cipher: {repr(test_cipher)}")
    print(f"Decoded: {decoded_256}")
    
    print("\n3. CAESAR CIPHER DECODE (26 partition, shift 18)")
    print("-" * 70)
    test_cipher_26 = "Af lzw twyaffafy Ygv ujwslwv"
    decoded_26 = decoder.decode_with_caesar_partition(test_cipher_26, 26, 18)
    print(f"Cipher: {test_cipher_26}")
    print(f"Decoded: {decoded_26}")
    
    print("\n4. GIANT WORD SEARCH - Most Common Patterns")
    print("-" * 70)
    patterns = decoder.giant_word_search(pattern_length=15, stride=10)
    print("Top 10 most common 15-character patterns in Bible:")
    for i, (pattern, count) in enumerate(patterns[:10], 1):
        print(f"{i}. '{pattern}' (appears {count} times)")
    
    print("\n5. NUMERIC PATTERN ANALYSIS")
    print("-" * 70)
    numeric_patterns = decoder.extract_numeric_patterns()
    print(f"Consecutive sequences found: {len(numeric_patterns['consecutive_sequences'])}")
    if numeric_patterns['consecutive_sequences']:
        print(f"Example: {numeric_patterns['consecutive_sequences'][0]}")
    
    print(f"\nRepeating patterns found: {len(numeric_patterns['repeating_patterns'])}")
    if numeric_patterns['repeating_patterns']:
        for pattern, count in numeric_patterns['repeating_patterns'][:5]:
            print(f"  Pattern {pattern} repeats {count} times")
    
    print("\n6. POLYALPHABETIC DECODE")
    print("-" * 70)
    test_poly = "ABCDEFGHIJKLMNOP"
    decoded_poly = decoder.polyalphabetic_decode(test_poly, key_length=10)
    print(f"Original: {test_poly}")
    print(f"Decoded: {decoded_poly}")
    
    print("\n7. BIBLE COORDINATE SYSTEM")
    print("-" * 70)
    # Example coordinates: chapter:verse:word
    coords = [(1, 1), (1, 2), (1, 3)]
    coord_text = decoder.bible_coordinates_to_text(coords)
    print(f"Coordinates: {coords}")
    print(f"Extracted text: {coord_text}")
    
    print("\n8. CHARACTER FREQUENCY ANALYSIS")
    print("-" * 70)
    bible_freq = Counter(decoder.bible_text.lower())
    print("Top 20 most common characters in Bible:")
    for char, count in bible_freq.most_common(20):
        if char.isprintable():
            print(f"  '{char}': {count} times")
    
    # Save analysis results
    print("\n9. SAVING ANALYSIS RESULTS")
    print("-" * 70)
    
    analysis_results = {
        'total_bible_characters': len(decoder.bible_text),
        'total_bible_numbers': len(decoder.bible_numbers),
        'unique_bible_numbers': len(set(decoder.bible_numbers)),
        'verse_count': len(decoder.verse_map),
        'word_count': len(decoder.word_freq),
        'most_common_words': [
            {'word': w, 'count': c} 
            for w, c in decoder.word_freq.most_common(50)
        ],
        'number_range': [min(decoder.bible_numbers), max(decoder.bible_numbers)],
        'cipher_keys': {
            'caesar_shift_18_alphabet_26': 'Standard Caesar with shift 18',
            'caesar_shift_18_ascii_256': 'Extended ASCII Caesar with shift 18',
            'polyalphabetic': decoder.bible_numbers[:20],
            'position_based': list(range(0, 100))
        }
    }
    
    with open('rohonc_analysis.json', 'w') as f:
        json.dump(analysis_results, f, indent=2)
    
    print("Analysis saved to rohonc_analysis.json")

if __name__ == "__main__":
    main()
