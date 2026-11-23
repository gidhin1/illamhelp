import type { InputHTMLAttributes, Ref } from "react";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "children"> & {
  label: string;
  inputRef?: Ref<HTMLInputElement>;
  secondary?: boolean;
  camera?: boolean;
};

export function FilePicker({ label, inputRef, secondary, camera, ...inputProps }: FilePickerProps): JSX.Element {
  const className = [
    "button media-picker-button",
    secondary && "secondary",
    camera && "media-camera-picker"
  ].filter(Boolean).join(" ");

  return (
    <label className={className}>
      <span>{label}</span>
      <input {...inputProps} type="file" ref={inputRef} />
    </label>
  );
}
