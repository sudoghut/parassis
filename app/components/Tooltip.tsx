import { useState, useRef, useEffect, ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  delay?: number;
}

export default function Tooltip({ content, children, delay = 500 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        // For fixed positioning, use viewport coordinates (no scrollY/scrollX)
        const top = rect.bottom + 8;
        const left = rect.left + rect.width / 2;
        setPosition({ top, left });
      }
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex items-center"
        style={{ display: 'inline-flex' }}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className="fixed px-3 py-2 text-sm whitespace-nowrap pointer-events-none"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translateX(-50%)',
            zIndex: 9999,
            backgroundColor: '#1f2937',
            color: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
            border: '2px solid #60a5fa'
          }}
        >
          {content}
          <div
            style={{
              position: 'absolute',
              width: '8px',
              height: '8px',
              backgroundColor: '#1f2937',
              top: '-4px',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              border: '2px solid #60a5fa',
              borderRight: 'none',
              borderBottom: 'none'
            }}
          ></div>
        </div>
      )}
    </>
  );
}
