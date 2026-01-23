/* global Word console */

export async function executeAppend(context, microsoftAction, paragraphs) {
  const { loc, new_text } = microsoftAction;

  if (!loc) {
    return;
  }

  try {
    // Parse paragraph index from loc (e.g., "p5" -> index 5)
    const match = loc.match(/^p(\d+)$/);
    if (!match) {
      throw new Error(`Invalid location format: ${loc}`);
    }
    
    const paragraphIndex = parseInt(match[1]); // Already 0-based
    
    if (paragraphIndex < 0 || paragraphIndex >= paragraphs.items.length) {
      throw new Error(`Paragraph index ${paragraphIndex} out of range (0-${paragraphs.items.length - 1})`);
    }
    
    const paragraph = paragraphs.items[paragraphIndex];
    const range = paragraph.getRange("Content");
    range.insertText(new_text, Word.InsertLocation.end);
  } catch (error) {
    throw new Error(
      `Append operation failed: ${error.message}\nAction: ${JSON.stringify(microsoftAction, null, 2)}`
    );
  }
}
