import * as React from "react";
import Select from "@cloudscape-design/components/select";
import Box from "@cloudscape-design/components/box";

export default function KBOptions({ options, onChange }) {
  const [selectedOption, setSelectedOption] = React.useState(null);
  
  const selectOptions = options.map((option, index) => ({
    label: option.doc,
    value: index.toString(),
    description: option.content.substring(0, 100) + '...',
    labelTag: `Page ${option.page}`,
    tags: option.score ? [`Relevance: ${(option.score * 100).toFixed(1)}%`] : []
  }));
  
  React.useEffect(() => {
    if (options.length > 0 && !selectedOption) {
      const defaultOption = selectOptions[0];
      setSelectedOption(defaultOption);
      if (onChange) onChange(defaultOption);
    }
  }, [options]);
  
  const handleChange = (detail) => {
    setSelectedOption(detail.selectedOption);
    if (onChange) onChange(detail.selectedOption);
  };
  
  return (
    <Box padding="s">
      <Select 
        selectedOption={selectedOption} 
        onChange={({ detail }) => handleChange(detail)} 
        options={selectOptions} 
        placeholder="Select a clause option" 
        expandToViewport 
      />
    </Box>
  );
}