import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { FormattedPost } from '../types';

interface PostCardProps {
  post: FormattedPost;
  id?: string;
  onReady?: () => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, id, onReady }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Use state to trigger re-renders during optimization
  const [optimalSize, setOptimalSize] = useState(72);
  const [isOptimizing, setIsOptimizing] = useState(true);
  
  const safePost = post || { title: '', content: [] };

  const processedContent = useMemo(() => {
    if (!safePost.content) return [];
    return safePost.content.map(line => {
      if (line === "") return "";
      return line.replace(/#/g, '').trim();
    });
  }, [safePost.content]);

  const processedTitle = useMemo(() => {
    if (!safePost.title) return "";
    let t = safePost.title.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
    t = t.replace(/[#*]/g, '').trim();
    t = t.replace(/[:.,;!?]+$/, '').trim();
    return t;
  }, [safePost.title]);

  useLayoutEffect(() => {
    if (!contentRef.current) return;

    let min = 12;
    let max = 150; 
    let best = 72;
    
    const safetyBuffer = 100;
    const maxAllowedHeight = 1350 - (300 + safetyBuffer); 

    for (let i = 0; i < 8; i++) {
      const mid = (min + max) / 2;
      contentRef.current.style.fontSize = `${mid}px`;
      
      if (contentRef.current.scrollHeight <= maxAllowedHeight) {
        best = mid;
        min = mid;
      } else {
        max = mid;
      }
    }

    setOptimalSize(best);
    setIsOptimizing(false);
    
    // Fire onReady after optimization
    if (onReady) {
      setTimeout(onReady, 50);
    }
  }, [processedContent, processedTitle, onReady]);

  const getListItemInfo = (line: string) => {
    const bulletMatch = line.match(/^([•\-\*])\s+(.*)$/);
    const numberMatch = line.match(/^(\d+\.)\s+(.*)$/);
    
    if (bulletMatch) {
      const marker = (bulletMatch[1] === '*' || bulletMatch[1] === '-') ? '•' : bulletMatch[1];
      return { marker, text: bulletMatch[2] };
    }
    if (numberMatch) return { marker: numberMatch[1], text: numberMatch[2] };
    
    return null;
  };

  if (!post) {
    return (
      <div 
        className="w-full h-full flex items-center justify-center text-white bg-black"
        style={{ width: '1080px', height: '1350px' }}
      >
        <span className="animate-pulse opacity-20 uppercase tracking-[0.5em] text-sm font-black">Aligning Canvas</span>
      </div>
    );
  }

  return (
    <div 
      id={id}
      className="relative flex flex-col items-center justify-center text-white overflow-hidden bg-black font-sans"
      style={{
        width: '1080px',
        height: '1350px',
        backgroundColor: '#000000',
        visibility: isOptimizing ? 'hidden' : 'visible'
      }}
    >
      {/* SOLID BACKGROUND MODIFIED PER USER REQUEST */}
      <div className="absolute inset-0 bg-black" />
      
      {/* NOISE OVERLAY FOR TEXTURE */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/carbon-fibre.png')" }}
      />

      <div 
        className="relative z-10 flex flex-col w-full h-full justify-center px-[120px] py-[150px] box-border"
      >
        {/* THE GUARDED CONTENT BOX */}
        <div 
          ref={contentRef}
          className="w-full flex flex-col items-start"
          style={{ 
            gap: '0.7em',
            fontSize: `${optimalSize}px`,
            textShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        >
          {processedTitle && (
            <h1 
              className="font-black text-center text-white leading-[0.85] uppercase tracking-[-0.05em] w-full"
              style={{ 
                fontSize: '1.4em',
                marginBottom: '0.25em'
              }}
            >
              {processedTitle}
            </h1>
          )}

          {/* CONTENT SECTION */}
          <div 
            className="w-full flex flex-col items-start"
            style={{ gap: '0.75em' }}
          >
            {processedContent.map((line, idx) => {
              if (line === "") return <div key={idx} style={{ height: '0.5em' }} />;

              const listItem = getListItemInfo(line);
              const contentToRender = listItem ? listItem.text : line;
              const markerWidth = listItem ? '1.2em' : '0';

              return (
                <div key={idx} className="w-full">
                  <p 
                    className="font-semibold text-white/90"
                    style={{ 
                      fontSize: '1em',
                      lineHeight: 1.25,
                      textAlign: 'left',
                      paddingLeft: markerWidth,
                      textIndent: `-${markerWidth}`,
                      letterSpacing: '-0.02em',
                      wordSpacing: '-0.03em'
                    }}
                  >
                    {listItem && (
                      <span className="text-white font-black mr-2 italic opacity-60" style={{ display: 'inline-block', width: markerWidth }}>
                        {listItem.marker}
                      </span>
                    )}
                    <span 
                      dangerouslySetInnerHTML={{ 
                        __html: (contentToRender || '')
                          .replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-black">$1</span>')
                      }} 
                    />
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* TECHNICAL MARGIN INDICATORS */}
      <div className="absolute inset-[30px] border border-white/20 rounded-3xl pointer-events-none z-20" />
    </div>
  );
};

export default PostCard;
