{{- define "illamhelp-local-infra.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "illamhelp-local-infra.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "illamhelp-local-infra.labels" -}}
app.kubernetes.io/name: {{ include "illamhelp-local-infra.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "illamhelp-local-infra.secretName" -}}
{{- .Values.secrets.name | default (printf "%s-secrets" (include "illamhelp-local-infra.fullname" .)) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "illamhelp-local-infra.podSecurityContext" -}}
seccompProfile:
  type: RuntimeDefault
{{- end -}}
