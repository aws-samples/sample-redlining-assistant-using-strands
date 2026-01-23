/* global Word */
import * as React from "react";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Checkbox from "@cloudscape-design/components/checkbox";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import KBOptions from "./KBOptions";
import { executeWordAction, getWordDocumentContent, isDocumentEmpty } from "../taskpane";

// Simple hash function
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

// Helper function to format action display
function formatAction(action) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

// Helper function to navigate to paragraph
async function navigateToParagraph(loc) {
  try {
    await Word.run(async (context) => {
      // Parse paragraph index from loc (e.g., "p5" -> index 5)
      const match = loc.match(/^p(\d+)$/);
      if (!match) {
        console.error(`Invalid location format: ${loc}`);
        return;
      }
      
      const paragraphIndex = parseInt(match[1]); // Already 0-based
      
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load("items");
      await context.sync();
      
      if (paragraphIndex < 0 || paragraphIndex >= paragraphs.items.length) {
        console.error(`Paragraph index ${paragraphIndex} out of range`);
        return;
      }
      
      const paragraph = paragraphs.items[paragraphIndex];
      const range = paragraph.getRange("Content");
      range.select();
      await context.sync();
    });
  } catch (error) {
    console.error(`Error navigating to paragraph ${loc}:`, error);
  }
}

export default function ModificationReview({ modifications, onApply, disabled, appliedIndices = [], rejectedIndices = [], documentHashWhenSent, onHashMismatch }) {
  // State for selected modifications (all selected by default)
  const [selectedMods, setSelectedMods] = React.useState(
    modifications.map((_, i) => i)
  );
  
  // State for expanded modifications
  const [expandedMods, setExpandedMods] = React.useState([]);
  
  // State for KB selections (mapping mod index to selected kb_option index)
  const [kbSelections, setKbSelections] = React.useState({});
  
  // State for errors (mapping mod index to error message)
  const [errors, setErrors] = React.useState({});
  
  // State for successes (mapping mod index to success status)
  const [successes, setSuccesses] = React.useState({});
  
  // Check if there are any errors
  const hasErrors = Object.keys(errors).length > 0;
  
  // State for container expansion
  const [containerExpanded, setContainerExpanded] = React.useState(true);
  
  // Collapse container when disabled
  React.useEffect(() => {
    if (disabled) {
      setContainerExpanded(false);
    }
  }, [disabled]);

  // Handle checkbox toggle for individual modifications
  const handleToggle = (index) => {
    setSelectedMods((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  // Handle expand/collapse and navigate to paragraph
  const handleExpand = (index, expanded) => {
    setExpandedMods((prev) =>
      expanded ? [...prev, index] : prev.filter((i) => i !== index)
    );

    // Navigate to paragraph when expanding
    if (expanded && modifications[index].loc) {
      navigateToParagraph(modifications[index].loc);
    }
  };

  // Handle KB option selection
  const handleKbSelect = (modIndex, selectedOption) => {
    setKbSelections((prev) => ({
      ...prev,
      [modIndex]: parseInt(selectedOption.value),
    }));
  };

  // Handle select/deselect all
  const handleToggleAll = () => {
    if (selectedMods.length === modifications.length) {
      // All selected, deselect all
      setSelectedMods([]);
    } else {
      // Not all selected, select all
      setSelectedMods(modifications.map((_, i) => i));
    }
  };

  // Apply checked modifications, reject unchecked ones
  const handleApply = async () => {
    // Check if document has changed before applying
    if (documentHashWhenSent) {
      const isEmpty = await isDocumentEmpty();
      const currentDoc = isEmpty ? "" : await getWordDocumentContent();
      const currentHash = simpleHash(currentDoc);
      
      if (currentHash !== documentHashWhenSent) {
        // Document changed - call hash mismatch handler and return
        if (onHashMismatch) {
          onHashMismatch();
        }
        
        // Mark ALL as rejected since document changed
        const appliedIndices = [];
        const rejectedIndices = modifications.map((_, i) => i);
        
        // Collapse and notify parent as rejected
        setContainerExpanded(false);
        onApply(appliedIndices, rejectedIndices);
        return;
      }
    }
    
    const modsToApply = modifications
      .map((mod, i) => ({ ...mod, originalIndex: i }))
      .filter((mod) => selectedMods.includes(mod.originalIndex))
      .map((mod) => {
        // If KB options exist and user selected one, use that content
        if (mod.kb_options && kbSelections[mod.originalIndex] !== undefined) {
          return {
            ...mod,
            new_text: mod.kb_options[kbSelections[mod.originalIndex]].formatted_content,
          };
        }
        return mod;
      })
      .sort((a, b) => {
        // Extract paragraph numbers and sort descending (p10 before p5)
        const aNum = parseInt(a.loc?.match(/^p(\d+)$/)?.[1] || 0);
        const bNum = parseInt(b.loc?.match(/^p(\d+)$/)?.[1] || 0);
        return bNum - aNum;
      });

    // Apply modifications with individual error handling
    const newErrors = {};
    const newSuccesses = {};
    
    for (const mod of modsToApply) {
      try {
        await executeWordAction([mod]);
        newSuccesses[mod.originalIndex] = true;
      } catch (error) {
        newErrors[mod.originalIndex] = error.message;
      }
    }

    setErrors(newErrors);
    setSuccesses(newSuccesses);

    // Get indices of applied vs rejected
    const appliedIndices = selectedMods;
    const rejectedIndices = modifications
      .map((_, i) => i)
      .filter(i => !selectedMods.includes(i));

    // Collapse container and call onApply with split indices
    setContainerExpanded(false);
    onApply(appliedIndices, rejectedIndices);
  };

  return (
    <Container>
      <ExpandableSection
        expanded={containerExpanded}
        onChange={({ detail }) => setContainerExpanded(detail.expanded)}
        headerText={
          <Box 
            fontSize="body-m" 
            fontWeight="bold"
            color={hasErrors ? "text-status-warning" : disabled ? "text-status-inactive" : "inherit"}
          >
            Proposed Changes{hasErrors ? " (errors present)" : ""}
          </Box>
        }
        headerActions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button 
              variant="inline-link" 
              onClick={handleToggleAll} 
              disabled={disabled}
            >
              {selectedMods.length === modifications.length ? "Deselect All" : "Select All"}
            </Button>
            <Button variant="inline-link" onClick={handleApply} disabled={disabled}>
              Apply
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="s">
        {modifications.map((mod, i) => (
          <ExpandableSection
            key={i}
            headerText={
              <Box 
                fontSize="body-s" 
                fontWeight="bold"
                color={
                  errors[i] ? "text-status-error" : 
                  successes[i] ? "text-status-success" : 
                  disabled && rejectedIndices.includes(i) ? "text-status-inactive" :
                  disabled && appliedIndices.includes(i) ? "text-status-success" :
                  "inherit"
                }
              >
                {errors[i] ? "❌ " : 
                 successes[i] ? "✓ " : 
                 disabled && appliedIndices.includes(i) ? "✓ " :
                 disabled && rejectedIndices.includes(i) ? "✗ " :
                 ""}{mod.task}
              </Box>
            }
            expanded={expandedMods.includes(i)}
            onChange={({ detail }) => handleExpand(i, detail.expanded)}
            headerActions={
              <Checkbox
                checked={selectedMods.includes(i)}
                onChange={() => handleToggle(i)}
                disabled={disabled}
              />
            }
          >
            <SpaceBetween size="xs">
              <div>
                <Box fontSize="body-s" fontWeight="bold">{formatAction(mod.action)}{mod.action !== "delete" ? " with..." : ""}</Box>
              </div>

              {mod.kb_options && mod.kb_options.length > 0 ? (
                <>
                  <div>
                    <strong>Knowledge Base Options:</strong>
                    <KBOptions
                      options={mod.kb_options}
                      onChange={(option) => handleKbSelect(i, option)}
                    />
                  </div>
                  <div>
                    <strong>Selected content:\n</strong>
                    <Box variant="code" fontSize="body-s">
                      {mod.kb_options[kbSelections[i] || 0].formatted_content || 
                       mod.kb_options[kbSelections[i] || 0].content}
                    </Box>
                  </div>
                </>
              ) : mod.new_text ? (
                <div>
                  <Box fontSize="body-s">{mod.new_text}</Box>
                </div>
              ) : null}

              {errors[i] && (
                <Alert type="error" header="Failed to apply modification">
                  <SpaceBetween size="xs">
                    <div>
                      {formatAction(mod.action)} <strong>at</strong> {mod.loc}
                      {mod.new_text && (
                        <> <strong>with</strong> {mod.new_text}</>
                      )}
                    </div>
                    <div>
                      <strong>Error Message:</strong> {errors[i]}
                    </div>
                  </SpaceBetween>
                </Alert>
              )}
            </SpaceBetween>
          </ExpandableSection>
        ))}
      </SpaceBetween>
    </ExpandableSection>
    </Container>
  );
}


