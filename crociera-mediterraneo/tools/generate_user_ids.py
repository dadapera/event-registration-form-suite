#!/usr/bin/env python3
"""
CSV User ID Generator

This script reads a CSV file with columns 'SCHEDA NUMERO', 'CODICE CLIENTE', 'EMAIL'
and generates unique IDs for each row, then saves the updated CSV with the ID column.

Usage:
    python generate_user_ids.py input.csv [output.csv]
    
    If no output file is specified, it will create a new file with '_with_ids' suffix.
"""

import csv
import hashlib
import sys
import os
import argparse


def generate_id(scheda_numero: str, codice_cliente: str, method: str = 'combined') -> str:
    """
    Generate a unique ID based on the input data.
    
    Args:
        scheda_numero: The 'SCHEDA NUMERO' value
        codice_cliente: The 'CODICE CLIENTE' value  
        method: Method to use for ID generation ('scheda', 'cliente', 'combined')
    
    Returns:
        8-character unique ID
    """
    if method == 'scheda':
        source = str(scheda_numero).strip()
    elif method == 'cliente':
        source = str(codice_cliente).strip()
    else:  # combined (default)
        source = f"{str(scheda_numero).strip()}_{str(codice_cliente).strip()}"
    
    # Create SHA256 hash and take first 24 characters 
    hash_object = hashlib.sha256(source.encode('utf-8'))
    return hash_object.hexdigest()[:24].upper()


def process_csv(input_file: str, output_file: str, id_method: str = 'combined') -> None:
    """
    Process the CSV file and add unique IDs.
    
    Args:
        input_file: Path to input CSV file
        output_file: Path to output CSV file
        id_method: Method for ID generation
    """
    rows_processed = 0
    ids_generated = set()
    duplicate_ids = []
    
    try:
        with open(input_file, 'r', encoding='utf-8', newline='') as infile:
            # Try to detect delimiter
            sample = infile.read(1024)
            infile.seek(0)
            
            # Common delimiters to try
            delimiters = [',', ';', '\t']
            dialect = None
            
            for delimiter in delimiters:
                if sample.count(delimiter) > 0:
                    try:
                        dialect = csv.Sniffer().sniff(sample, delimiters=delimiter)
                        break
                    except:
                        continue
            
            if not dialect:
                # Default to comma if detection fails
                dialect = csv.excel()
                dialect.delimiter = ','
            
            reader = csv.DictReader(infile, dialect=dialect)
            
            # Normalize column names (remove extra spaces, handle case variations)
            fieldnames = [name.strip() for name in reader.fieldnames]
            
            # Map common column name variations
            column_mapping = {}
            for field in fieldnames:
                field_upper = field.upper()
                if 'SCHEDA' in field_upper and 'NUMERO' in field_upper:
                    column_mapping['SCHEDA_NUMERO'] = field
                elif 'CODICE' in field_upper and 'CLIENTE' in field_upper:
                    column_mapping['CODICE_CLIENTE'] = field
                elif 'EMAIL' in field_upper or 'MAIL' in field_upper:
                    column_mapping['EMAIL'] = field
            
            # Check required columns
            if 'SCHEDA_NUMERO' not in column_mapping or 'CODICE_CLIENTE' not in column_mapping:
                raise ValueError(f"Required columns not found. Available columns: {fieldnames}")
            
            # Prepare output
            output_fieldnames = fieldnames + ['USER_ID']
            
            with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
                writer = csv.DictWriter(outfile, fieldnames=output_fieldnames, dialect=dialect)
                writer.writeheader()
                
                for row in reader:
                    rows_processed += 1
                    
                    # Extract values for ID generation
                    scheda_numero = row[column_mapping['SCHEDA_NUMERO']]
                    codice_cliente = row[column_mapping['CODICE_CLIENTE']]
                    
                    # Generate ID
                    user_id = generate_id(scheda_numero, codice_cliente, id_method)
                    
                    # Check for duplicates
                    if user_id in ids_generated:
                        duplicate_ids.append((rows_processed, user_id, scheda_numero, codice_cliente))
                    
                    ids_generated.add(user_id)
                    
                    # Add ID to row
                    row['USER_ID'] = user_id
                    
                    writer.writerow(row)
                    
                    # Show progress for large files
                    if rows_processed % 100 == 0:
                        print(f"Processed {rows_processed} rows...")
    
    except FileNotFoundError:
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)
    except Exception as e:
        print(f"Error processing file: {str(e)}")
        sys.exit(1)
    
    # Summary
    print(f"\n✅ Processing complete!")
    print(f"📊 Rows processed: {rows_processed}")
    print(f"🆔 Unique IDs generated: {len(ids_generated)}")
    print(f"📁 Output saved to: {output_file}")
    
    if duplicate_ids:
        print(f"\n⚠️  Warning: {len(duplicate_ids)} duplicate IDs found:")
        for row_num, user_id, scheda, cliente in duplicate_ids[:5]:  # Show first 5
            print(f"   Row {row_num}: ID {user_id} (Scheda: {scheda}, Cliente: {cliente})")
        if len(duplicate_ids) > 5:
            print(f"   ... and {len(duplicate_ids) - 5} more")
        print("   Consider using a different ID generation method.")


def main():
    parser = argparse.ArgumentParser(
        description="Generate unique user IDs for CSV data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python generate_user_ids.py data.csv
    python generate_user_ids.py data.csv output_with_ids.csv
    python generate_user_ids.py data.csv --method scheda
    python generate_user_ids.py data.csv --method cliente
        """
    )
    
    parser.add_argument('input_file', help='Input CSV file path')
    parser.add_argument('output_file', nargs='?', help='Output CSV file path (optional)')
    parser.add_argument('--method', choices=['scheda', 'cliente', 'combined'], 
                       default='combined', help='ID generation method (default: combined)')
    
    args = parser.parse_args()
    
    # Determine output file name
    if args.output_file:
        output_file = args.output_file
    else:
        name, ext = os.path.splitext(args.input_file)
        output_file = f"{name}_with_ids{ext}"
    
    print(f"🔄 Processing: {args.input_file}")
    print(f"📤 Output: {output_file}")
    print(f"🔧 ID Method: {args.method}")
    print()
    
    process_csv(args.input_file, output_file, args.method)


if __name__ == "__main__":
    main() 