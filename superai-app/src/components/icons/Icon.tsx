// 图标系统 · §6.6：24 网格 · stroke-width 2 · linecap butt · linejoin miter
// 容器类图形（圆/文档/文件夹）= 白色填充(var(--card)) + 墨色描边；纯线符号无填充
// 禁止图标库，全部自绘 SVG。颜色默认 currentColor，由父级控制。
import type { GenFileKind } from '../../types';

type P = { size?: number; className?: string };

function S({ size = 20, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      className={className}
    >
      {children}
    </svg>
  );
}

// 完成：黑圈描边 + 白底 + 黑勾
export const Check = ({ size, className }: P) => (
  <S size={size} className={className}>
    <circle cx="12" cy="12" r="8.5" style={{ fill: 'var(--card)' }} />
    <path d="M6.8 12.2 10.5 15.9 17.2 8.4" />
  </S>
);

// 进行中：圈 + 指针
export const Clock = ({ size, className }: P) => (
  <S size={size} className={className}>
    <circle cx="12" cy="12" r="8.5" style={{ fill: 'var(--card)' }} />
    <path d="M12 7.4v5l3 1.8" />
  </S>
);

// 文件容器（共用轮廓）
function FileShape({ inner }: { inner: React.ReactNode }) {
  return (
    <>
      <path d="M6 3h8l4 4v14H6z" style={{ fill: 'var(--card)' }} />
      <path d="M14 3v4h4" />
      {inner}
    </>
  );
}

// 文件类型图标
export function FileTypeIcon({ kind, size = 20, className }: { kind: GenFileKind } & P) {
  const inner = {
    html: <path d="M9.8 12.2 7.6 15l2.2 2.8M14.2 12.2 16.4 15l-2.2 2.8" />,
    md: <path d="M9 17.8v-5.2l2.1 2.1L13.2 12.6v5.2" />,
    json: <path d="M10.8 11.8c-1.3 0-1.1 1.9-2 2.2.9.3.7 2.2 2 2.2M13.2 11.8c1.3 0 1.1 1.9 2 2.2-.9.3-.7 2.2-2 2.2" />,
    xls: <path d="M8.4 11.8h7.2v5.6H8.4zM8.4 14.6h7.2M12 11.8v5.6" />,
  }[kind];
  return (
    <S size={size} className={className}>
      <FileShape inner={inner} />
    </S>
  );
}

// 文件夹
export const Folder = ({ size, className }: P) => (
  <S size={size} className={className}>
    <path d="M3 6h6.2l2 2.6H21V21H3z" style={{ fill: 'var(--card)' }} />
    <path d="M3 6V3h5.6l1.9 2.6" />
  </S>
);

// 技能（星形，白填充）
export const Sparkle = ({ size, className }: P) => (
  <S size={size} className={className}>
    <path d="M12 3.6 14 9.6 20.4 12 14 14.4 12 20.4 10 14.4 3.6 12 10 9.6z" style={{ fill: 'var(--card)' }} />
  </S>
);

// 数据折线
export const Chart = ({ size, className }: P) => (
  <S size={size} className={className}>
    <path d="M4 3.5V21h16" />
    <path d="M7.5 16.4 11 12.2l2.7 2.2 4.3-5.8" />
  </S>
);

// 提示（圈 + !）
export const Info = ({ size, className }: P) => (
  <S size={size} className={className}>
    <circle cx="12" cy="12" r="8.5" style={{ fill: 'var(--card)' }} />
    <path d="M12 8.2v4.4M12 15.6v.4" />
  </S>
);
