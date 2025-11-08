export interface AnnotationDto {
  quote: string;
  comment: string;
  contextBefore?: string;
  contextAfter?: string;
  expertise?: string[];
  style?: {
    mode: 'highlight' | 'underline';
    color?: string;
    underlineStyle?: 'solid' | 'dashed' | 'dotted' | 'wavy';
  };
}

export interface AnnotationRecord extends AnnotationDto {
  id: string;
  createdAt: string;
}
