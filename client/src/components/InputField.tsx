interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  placeholder?: string;
}

export default function Input({ label, icon, placeholder, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-sm font-medium text-muted ml-1">{label}</label>}
      <div className="relative flex items-center">
        {icon && <div className="absolute left-3 text-muted/60">{icon}</div>}
        <input
          {...props}
          placeholder={placeholder}
          className={`w-full bg-foreground shadow-md border border-borders text-muted px-4 py-2.5 rounded-xl outline-none transition-all focus:border-borders focus:ring-1 focus:ring-borders ${icon ? 'pl-10' : ''}`}
        />
      </div>
    </div>
  );
}