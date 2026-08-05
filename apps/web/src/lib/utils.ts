import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Generate an array of page numbers and ellipsis markers for pagination.
 *
 * @example
 *   Near beginning:  [1, 2, 3, 4, '...', 10]
 *   In middle:       [1, '...', 4, 5, 6, '...', 10]
 *   Near end:        [1, '...', 7, 8, 9, 10]
 */
export function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Always include page 1
  const pages: (number | "...")[] = [1];

  if (currentPage <= 3) {
    // Near beginning: 1, 2, 3, 4, ..., N
    for (let i = 2; i <= 4; i++) {
      pages.push(i);
    }
    pages.push("...");
    pages.push(totalPages);
  } else if (currentPage >= totalPages - 2) {
    // Near end: 1, ..., N-3, N-2, N-1, N
    pages.push("...");
    for (let i = totalPages - 3; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // In middle: 1, ..., C-1, C, C+1, ..., N
    pages.push("...");
    pages.push(currentPage - 1);
    pages.push(currentPage);
    pages.push(currentPage + 1);
    pages.push("...");
    pages.push(totalPages);
  }

  return pages;
}
