package illamhelp.pii

default allow := false

is_connection_accepted if {
  input.relationship_status == "accepted"
}

has_active_grant if {
  input.grant.status == "active"
}

is_not_expired if {
  not input.grant.expires_at
}

is_not_expired if {
  input.grant.expires_at
  now_ns := time.now_ns()
  grant_expiry_ns := time.parse_rfc3339_ns(input.grant.expires_at)
  now_ns < grant_expiry_ns
}

field_granted if {
  input.field
  input.field == input.grant.granted_fields[_]
}

allow if {
  input.actor_id != input.owner_id
  is_connection_accepted
  has_active_grant
  is_not_expired
  field_granted
}
