package hmac_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/agent-platform/webhook-security/pkg/hmac"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	testSecret = []byte("super-secret-key")
	testBody   = []byte(`{"event":"alert","id":"INC-001"}`)
)

func validTimestamp() string {
	return fmt.Sprintf("%d", time.Now().Unix())
}

func TestValidate_HappyPath(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)
	ts := validTimestamp()

	err := v.Validate(sig, ts, testBody, testSecret)
	assert.NoError(t, err)
}

func TestValidate_ReplayDetected_OldTimestamp(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)
	oldTs := fmt.Sprintf("%d", time.Now().Unix()-400)

	err := v.Validate(sig, oldTs, testBody, testSecret)
	assert.ErrorIs(t, err, hmac.ErrReplayDetected)
}

func TestValidate_ReplayDetected_FutureTimestamp(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)
	futureTs := fmt.Sprintf("%d", time.Now().Unix()+400)

	err := v.Validate(sig, futureTs, testBody, testSecret)
	assert.ErrorIs(t, err, hmac.ErrReplayDetected)
}

func TestValidate_WrongSecret(t *testing.T) {
	v := hmac.New(300)
	wrongSig := v.ComputeSignature(testBody, []byte("wrong-secret"))
	ts := validTimestamp()

	err := v.Validate(wrongSig, ts, testBody, testSecret)
	assert.ErrorIs(t, err, hmac.ErrInvalidSignature)
}

func TestValidate_MissingSignature(t *testing.T) {
	v := hmac.New(300)
	ts := validTimestamp()

	err := v.Validate("", ts, testBody, testSecret)
	assert.ErrorIs(t, err, hmac.ErrMissingSignature)
}

func TestValidate_MissingTimestamp(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)

	err := v.Validate(sig, "", testBody, testSecret)
	assert.ErrorIs(t, err, hmac.ErrMissingTimestamp)
}

func TestValidate_MalformedTimestamp(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)

	err := v.Validate(sig, "not-a-number", testBody, testSecret)
	assert.ErrorIs(t, err, hmac.ErrMissingTimestamp)
}

func TestComputeSignature_Deterministic(t *testing.T) {
	v := hmac.New(300)

	sig1 := v.ComputeSignature(testBody, testSecret)
	sig2 := v.ComputeSignature(testBody, testSecret)

	require.Equal(t, sig1, sig2)
	assert.Contains(t, sig1, "sha256=")
	assert.Len(t, sig1, len("sha256=")+64) // sha256 hex = 64 chars
}

func TestComputeSignature_DifferentBodiesProduceDifferentSigs(t *testing.T) {
	v := hmac.New(300)

	sig1 := v.ComputeSignature([]byte("body-one"), testSecret)
	sig2 := v.ComputeSignature([]byte("body-two"), testSecret)

	assert.NotEqual(t, sig1, sig2)
}
