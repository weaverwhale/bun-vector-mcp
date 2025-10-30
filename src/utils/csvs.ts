/**
 * Schema mapping interface for CSV columns
 */
export interface CSVSchemaMapping {
  title?: string;
  content?: string;
  link?: string;
  collection?: string;
  html?: string;
  thesis?: string;
  detected: boolean;
}

/**
 * Parse CSV content into array of row objects
 * Handles quoted fields, escaped quotes, and newlines within fields
 */
export function parseCSV(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  const lines = content.split('\n');
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i += 2;
        continue;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (!insideQuotes && char === ',') {
      // End of field
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if (!insideQuotes && char === '\n') {
      // End of row
      currentRow.push(currentField);
      if (currentRow.length > 0 && currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    // Regular character
    currentField += char;
    i++;
  }

  // Handle last field/row if no trailing newline
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  // First row is headers
  const headers = rows[0]!.map(h => h.trim());
  const data: Array<Record<string, string>> = [];

  // Convert remaining rows to objects
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    const obj: Record<string, string> = {};

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const header = headers[colIdx]!;
      const value = row[colIdx] || '';
      obj[header] = value.trim();
    }

    data.push(obj);
  }

  return data;
}

/**
 * Detects CSV schema and maps columns to standard fields
 * Supports multiple CSV formats by matching column names to known patterns
 */
export function detectCSVSchema(columns: string[]): CSVSchemaMapping {
  const columnLower = columns.map(c => c.toLowerCase());
  const mapping: CSVSchemaMapping = { detected: false };

  // Define column name patterns for each standard field
  const titlePatterns = ['title', 'header', 'name', 'heading'];
  const contentPatterns = ['content', 'body', 'text', 'description', 'details'];
  const linkPatterns = ['link', 'url', 'href', 'uri'];
  const collectionPatterns = [
    'collection',
    'source',
    'category',
    'group',
    'folder',
  ];
  const htmlPatterns = ['html', 'content_html', 'html_content', 'raw_html'];
  const thesisPatterns = ['thesis', 'question', 'query'];

  // Find matching columns
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const colLower = columnLower[i];

    if (!col || !colLower) continue;

    if (
      !mapping.title &&
      titlePatterns.some(p => colLower === p || colLower.includes(p))
    ) {
      mapping.title = col;
      mapping.detected = true;
    }
    if (!mapping.content && contentPatterns.some(p => colLower === p)) {
      mapping.content = col;
      mapping.detected = true;
    }
    if (!mapping.link && linkPatterns.some(p => colLower === p)) {
      mapping.link = col;
      mapping.detected = true;
    }
    if (!mapping.collection && collectionPatterns.some(p => colLower === p)) {
      mapping.collection = col;
      mapping.detected = true;
    }
    if (
      !mapping.html &&
      htmlPatterns.some(p => colLower === p || colLower.includes(p))
    ) {
      mapping.html = col;
      mapping.detected = true;
    }
    if (!mapping.thesis && thesisPatterns.some(p => colLower === p)) {
      mapping.thesis = col;
      mapping.detected = true;
    }
  }

  return mapping;
}
