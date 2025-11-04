#!/usr/bin/env python3
"""Convenient command-line wrapper around the Rohonc Bible cipher toolkit."""

import argparse
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

from bible_cipher_analysis import BibleCipherAnalyzer
from rohonc_decoder import RohoncDecoder
from complete_cipher_mapper import CompleteCipherMapper


def get_analyzer(verbose: bool = False) -> BibleCipherAnalyzer:
    """Return a ``BibleCipherAnalyzer`` instance."""

    return BibleCipherAnalyzer(verbose=verbose)


def get_decoder(verbose: bool = False) -> RohoncDecoder:
    """Return a ``RohoncDecoder`` instance."""

    return RohoncDecoder(verbose=verbose)


def parse_number_sequence(sequence: str) -> List[int]:
    """Convert a comma or space separated string into a list of integers."""

    parts: Iterable[str] = sequence.replace("\n", " ").replace(",", " ").split()
    numbers: List[int] = []
    for part in parts:
        if part.strip():
            numbers.append(int(part))
    if not numbers:
        raise ValueError("No numbers detected in the provided sequence")
    return numbers


def read_sequence_from_file(path: Path) -> List[int]:
    """Read a number sequence from a text file."""

    return parse_number_sequence(path.read_text())


def command_caesar(args: argparse.Namespace) -> None:
    analyzer = get_analyzer()
    shift = -args.shift if args.decrypt else args.shift
    if args.alphabet == "26":
        result = analyzer.caesar_cipher_26(args.text, key=shift)
    else:
        result = analyzer.caesar_cipher_256(args.text, key=shift)
    print(result)


def command_numbers(args: argparse.Namespace) -> None:
    analyzer = get_analyzer()
    numbers = analyzer.all_numbers
    if args.unique:
        numbers = sorted(set(numbers))
    if args.offset < 0:
        print("Error: offset must be non-negative.")
        return
    slice_end = args.offset + args.limit
    selection = numbers[args.offset:slice_end]
    if not selection:
        print("No numbers available for the requested range.")
        return
    print(", ".join(map(str, selection)))
    total = len(numbers) if not args.unique else len(set(analyzer.all_numbers))
    print(f"Showing {len(selection)} of {total} numbers (offset {args.offset}).")


def command_word_search(args: argparse.Namespace) -> None:
    analyzer = get_analyzer()
    positions = analyzer.word_search_pattern(args.phrase)
    if not positions:
        print("Phrase not found in Bible text.")
        return
    limit = min(args.limit, len(positions))
    snippet_positions = positions[:limit]
    print(f"Found {len(positions)} matches. Showing first {len(snippet_positions)} positions:")
    print(", ".join(map(str, snippet_positions)))


def command_decode_numbers(args: argparse.Namespace) -> None:
    if not args.sequence and not args.sequence_file:
        raise SystemExit("Provide --sequence or --sequence-file with Rohonc numbers.")
    if args.sequence:
        sequence = parse_number_sequence(args.sequence)
    else:
        sequence = read_sequence_from_file(args.sequence_file)
    decoder = get_decoder()
    decoded = decoder.decode_number_sequence(sequence)
    print(decoded if decoded else "No characters could be decoded from the sequence.")


def command_frequencies(args: argparse.Namespace) -> None:
    decoder = get_decoder()
    filtered = (
        (word, count)
        for word, count in decoder.word_freq.most_common()
        if len(word) >= args.min_length
    )
    rows = []
    for i, (word, count) in enumerate(filtered, 1):
        rows.append(f"{i:>3}. {word:<15} {count}")
        if i >= args.limit:
            break
    if not rows:
        print("No words matched the requested filters.")
        return
    print("Top Bible words by frequency:")
    print("\n".join(rows))


def command_export(args: argparse.Namespace) -> None:
    mapper = CompleteCipherMapper(verbose=not args.quiet)
    mapper.export_all_mappings()
    if args.master_guide:
        mapper.create_master_cipher_document()
    print("Artifacts generated in current directory.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="High-level helpers for the Rohonc Bible cipher analysis toolkit."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    caesar_parser = subparsers.add_parser(
        "caesar", help="Encrypt or decrypt text with the configured Caesar shifts."
    )
    caesar_parser.add_argument("text", help="Text to transform.")
    caesar_parser.add_argument(
        "--alphabet",
        choices=["26", "256"],
        default="26",
        help="Alphabet size to use for the Caesar shift (default: 26).",
    )
    caesar_parser.add_argument(
        "--shift",
        type=int,
        default=18,
        help="Shift amount to apply (default: 18).",
    )
    caesar_parser.add_argument(
        "--decrypt",
        action="store_true",
        help="Invert the shift to perform decryption instead of encryption.",
    )
    caesar_parser.set_defaults(func=command_caesar)

    numbers_parser = subparsers.add_parser(
        "numbers", help="Inspect the extracted Bible number sequences."
    )
    numbers_parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Starting index within the sequence (default: 0).",
    )
    numbers_parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="How many numbers to display (default: 20).",
    )
    numbers_parser.add_argument(
        "--unique",
        action="store_true",
        help="Display unique numbers in ascending order.",
    )
    numbers_parser.set_defaults(func=command_numbers)

    word_parser = subparsers.add_parser(
        "word-search", help="Locate phrases inside the Bible corpus."
    )
    word_parser.add_argument("phrase", help="Phrase to locate within the Bible text.")
    word_parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Maximum number of positions to display (default: 10).",
    )
    word_parser.set_defaults(func=command_word_search)

    decode_parser = subparsers.add_parser(
        "decode-numbers", help="Decode Rohonc number sequences into text."
    )
    decode_parser.add_argument(
        "--sequence",
        help="Comma or space separated list of numbers (e.g. '100, 200, 300').",
    )
    decode_parser.add_argument(
        "--sequence-file",
        type=Path,
        help="Path to a file containing numbers to decode.",
    )
    decode_parser.set_defaults(func=command_decode_numbers)

    freq_parser = subparsers.add_parser(
        "frequencies", help="List common Bible words to aid symbol mapping."
    )
    freq_parser.add_argument(
        "--limit",
        type=int,
        default=15,
        help="How many entries to show (default: 15).",
    )
    freq_parser.add_argument(
        "--min-length",
        type=int,
        default=1,
        help="Minimum word length to include in the report (default: 1).",
    )
    freq_parser.set_defaults(func=command_frequencies)

    export_parser = subparsers.add_parser(
        "export", help="Regenerate JSON artifacts and the master cipher guide."
    )
    export_parser.add_argument(
        "--master-guide",
        action="store_true",
        help="Also rebuild MASTER_CIPHER_GUIDE.json.",
    )
    export_parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress logs from the underlying generator.",
    )
    export_parser.set_defaults(func=command_export)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
