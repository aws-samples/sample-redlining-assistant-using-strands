import * as React from "react";
import PromptInput from "@cloudscape-design/components/prompt-input";

export default function ChatInput({ onSendMessage, disabled }) {
  const [value, setValue] = React.useState("");
  
  const handleAction = () => {
    if (!value.trim() || disabled) return; 
    onSendMessage(value);
    setValue("");
  };

  return (
      <PromptInput
      onAction={handleAction}
      onChange={({ detail }) => setValue(detail.value)}
      value={value}
      actionButtonAriaLabel="Send message"
      actionButtonIconName="send"
      ariaLabel="Prompt input with action button"
      disableActionButton={!value.trim() || disabled}
      disabled={disabled}
      disableSecondaryActionsPaddings
      maxRows={20}
      minRows={5}
      placeholder="Ask a question"
      />
  );
};
