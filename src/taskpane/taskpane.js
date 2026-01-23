/* global Word console */

import { executeReplace } from "./microsoft-actions/replace.js";
import { executeAppend } from "./microsoft-actions/append.js";
import { executePrepend } from "./microsoft-actions/prepend.js";
import { executeDelete } from "./microsoft-actions/delete.js";
import { executeHighlight } from "./microsoft-actions/highlight.js";
import { executeFormatBold } from "./microsoft-actions/format_bold.js";
import { executeFormatItalic } from "./microsoft-actions/format_italic.js";
import { executeStrikethrough } from "./microsoft-actions/strikethrough.js";



async function createParagraphMapping() {
  return await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items");
    await context.sync();

    // Load text for all paragraphs and store ranges
    const ranges = [];
    for (let i = 0; i < paragraphs.items.length; i++) {
      const paragraph = paragraphs.items[i];
      const range = paragraph.getRange("Content");
      range.load("text");
      ranges.push(range);
    }

    await context.sync();

    // Build mapping with p0, p1, etc. (0-based indexing)
    const paragraphMapping = {};
    for (let i = 0; i < ranges.length; i++) {
      const paragraphName = `p${i}`;
      paragraphMapping[paragraphName] = ranges[i].text;
    }

    return paragraphMapping;
  });
}

export async function isDocumentEmpty() {
  return await Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();

    // Check if document is empty or only contains whitespace
    return !body.text || body.text.trim().length === 0;
  });
}

export async function getWordDocumentContent() {
  // Create paragraph mapping and return document content with paragraph-based location pointers
  try {
    const startTime = performance.now();

    // Create paragraph mapping
    const paragraphMapping = await createParagraphMapping();
    const paragraphCount = Object.keys(paragraphMapping).length;

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Convert to JSONL-style string format for token efficiency
    // Format: "p0: text0\np1: text1\n..."
    return Object.entries(paragraphMapping)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
  } catch (error) {
    console.log("Error getting document content: " + error);
    return "";
  }
}

export async function getSelectedText() {
  // Get currently highlighted/selected text
  try {
    return await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load("text");
      await context.sync();
      return selection.text || null;
    });
  } catch (error) {
    console.log("Error getting selected text: " + error);
    return null;
  }
}

async function setTrackingMode(mode = "trackAll") {
  try {
    await Word.run(async (context) => {
      context.document.changeTrackingMode =
        mode === "disable" ? Word.ChangeTrackingMode.off : Word.ChangeTrackingMode.trackAll;
      await context.sync();
    });
  } catch (error) {
    console.log(`Error setting tracking mode: ` + error);
  }
}

export async function executeWordAction(microsoftActions) {
  const errors = [];

  try {
    // Enable tracking before executing actions
    await setTrackingMode("trackAll");

    // Single Word.run for all actions - batch sync at the end
    await Word.run(async (context) => {
      // Load paragraphs once upfront for all actions
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load("items");
      await context.sync();

      for (const action of microsoftActions) {
        try {
          switch (action.action) {
            case "none":
              break;
            case "replace":
              await executeReplace(context, action, paragraphs);
              break;
            case "append":
              await executeAppend(context, action, paragraphs);
              break;
            case "prepend":
              await executePrepend(context, action, paragraphs);
              break;
            case "delete":
              await executeDelete(context, action, paragraphs);
              break;
            case "highlight":
              await executeHighlight(context, action, paragraphs);
              break;
            case "format_bold":
              await executeFormatBold(context, action, paragraphs);
              break;
            case "format_italic":
              await executeFormatItalic(context, action, paragraphs);
              break;
            case "strikethrough":
              await executeStrikethrough(context, action, paragraphs);
              break;
            default:
              console.log(`Unknown action: ${action.action}`);
          }
        } catch (error) {
          errors.push(`❌ ${action.action.toUpperCase()}: ${error.message}`);
        }
      }
      
      // Single sync for all actions
      await context.sync();
    });

    if (errors.length > 0) {
      throw new Error(`Some actions failed:\n\n${errors.join("\n\n")}`);
    }
  } catch (error) {
    console.log("Error executing Word actions: " + error);
    throw error;
  }
}
