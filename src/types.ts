import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

export const companySchema = z.object({
  razao_social: z.string().min(1, "Razão Social é obrigatória"),
  nome_fantasia: z.string().min(1, "Nome Fantasia é obrigatório"),
  cnpj: z.string().regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, "CNPJ inválido (00.000.000/0000-00)"),
  emails: z.array(z.string().email("E-mail inválido")).min(1, "Pelo menos um e-mail é necessário"),
  manager_id: z.number().optional().nullable(),
});

export const templateSchema = z.object({
  name: z.string().min(1, "Nome do relatório é obrigatório"),
  subject: z.string().min(1, "Assunto é obrigatório"),
  body: z.string().min(1, "Corpo do e-mail é obrigatório"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CompanyInput = z.infer<typeof companySchema>;
export type TemplateInput = z.infer<typeof templateSchema>;

export interface Company extends CompanyInput {
  id: number;
  manager_name?: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  signature?: string;
}

export interface Template extends TemplateInput {
  id: number;
}

export interface Log {
  id: number;
  company_id: number;
  company_name: string;
  template_id: number;
  template_name: string;
  sent_at: string;
  status: 'success' | 'error';
  error_message?: string;
}
