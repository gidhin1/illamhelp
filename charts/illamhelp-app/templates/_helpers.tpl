{{- define "illamhelp-app.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "illamhelp-app.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "illamhelp-app.labels" -}}
app.kubernetes.io/name: {{ include "illamhelp-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "illamhelp-app.podSecurityContext" -}}
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "illamhelp-app.containerSecurityContext" -}}
allowPrivilegeEscalation: false
runAsNonRoot: true
readOnlyRootFilesystem: true
capabilities:
  drop:
    - ALL
{{- end -}}

{{- define "illamhelp-app.secretName" -}}
{{- if .Values.secrets.name -}}
{{- .Values.secrets.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-secrets" (include "illamhelp-app.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
