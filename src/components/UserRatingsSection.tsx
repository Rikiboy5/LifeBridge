import React, { useCallback, useEffect, useMemo, useState } from "react";

type RatingItem = {
  id_rating: number;
  user_id: number;
  rated_by_user_id: number;
  rating: number;
  comment?: string | null;
  created_at?: string | null;
  rated_by_name?: string | null;
};

type RatingStats = {
  average: number | null;
  count: number;
};

type UserRatingsSectionProps = {
  userId?: number | null;
  currentUserId?: number | null;
  baseUrl: string;
  pageSize?: number;
  showRateButton?: boolean;
  className?: string;
};

const DEFAULT_PAGE_SIZE = 5;

const formatRatingDate = (val?: string | null) => {
  if (!val) return "";
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return val.slice(0, 10);
};

const StarRow = ({ value, size = "text-xl" }: { value: number; size?: string }) => (
  <div className={`flex gap-1 ${size}`} aria-label={`Hodnotenie ${value} z 5`}>
    {[1, 2, 3, 4, 5].map((star) => {
      const filled = value >= star - 0.2;
      return (
        <span key={star} className={filled ? "text-yellow-400" : "text-gray-300"} aria-hidden="true">
          {"\u2605"}
        </span>
      );
    })}
  </div>
);

export default function UserRatingsSection({
  userId,
  currentUserId = null,
  baseUrl,
  pageSize = DEFAULT_PAGE_SIZE,
  showRateButton = true,
  className = "mt-10",
}: UserRatingsSectionProps) {
  const targetUserId = Number(userId);
  const isOwnProfile = useMemo(
    () => Boolean(currentUserId && Number(currentUserId) === targetUserId),
    [currentUserId, targetUserId]
  );

  const [ratings, setRatings] = useState<RatingItem[]>([]);
  const [stats, setStats] = useState<RatingStats>({ average: null, count: 0 });
  const [myRating, setMyRating] = useState<RatingItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [targetUserId]);

  const fetchRatings = useCallback(
    async (requestedPage: number) => {
      if (!targetUserId) return;
      setLoading(true);
      setError(null);
      try {
        const ratedByQuery = currentUserId ? `&rated_by=${currentUserId}` : "";
        const res = await fetch(
          `${baseUrl}/api/users/${targetUserId}/ratings?page=${requestedPage}&page_size=${pageSize}${ratedByQuery}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Nepodarilo sa nacitat hodnotenia.");
        }

        const normalized: RatingItem[] = Array.isArray(data.items)
          ? data.items.map((item: RatingItem) => ({
              ...item,
              rating: typeof item.rating === "number" ? item.rating : Number(item.rating) || 0,
            }))
          : [];
        setRatings(normalized);

        const rawAverage = data.stats?.average;
        let averageValue: number | null = null;
        if (rawAverage !== undefined && rawAverage !== null && rawAverage !== "") {
          const parsedAverage = typeof rawAverage === "number" ? rawAverage : Number(rawAverage);
          averageValue = Number.isNaN(parsedAverage) ? null : parsedAverage;
        }
        setStats({
          average: averageValue,
          count: Number(data.stats?.count) || 0,
        });

        if (data.my_rating) {
          setMyRating({
            ...data.my_rating,
            rating: typeof data.my_rating.rating === "number" ? data.my_rating.rating : Number(data.my_rating.rating) || 0,
          });
        } else {
          setMyRating(null);
        }

        const totalPages = Math.max(1, Number(data.pages) || Number(data.pagination?.pages) || 1);
        setPages(totalPages);
        if (requestedPage > totalPages) {
          setPage(totalPages);
        }
      } catch (e: any) {
        setError(e.message || "Nepodarilo sa nacitat hodnotenia.");
      } finally {
        setLoading(false);
      }
    },
    [targetUserId, currentUserId, baseUrl, pageSize]
  );

  useEffect(() => {
    if (!targetUserId) return;
    fetchRatings(page);
  }, [fetchRatings, page, targetUserId]);

  const handleOpenModal = () => {
    setSelectedRating(myRating?.rating ?? 0);
    setComment(myRating?.comment ?? "");
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!targetUserId) return;
    if (!currentUserId) {
      setSubmitError("Pre hodnotenie sa prosim prihlas.");
      return;
    }
    if (isOwnProfile) {
      setSubmitError("Svoj profil nie je mozne hodnotit.");
      return;
    }
    if (selectedRating < 1 || selectedRating > 5) {
      setSubmitError("Vyber pocet hviezdiciek (1 az 5).");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${baseUrl}/api/users/${targetUserId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rated_by_user_id: currentUserId,
          rating: selectedRating,
          comment: comment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nepodarilo sa ulozit hodnotenie.");
      }
      await fetchRatings(1);
      setPage(1);
      setIsModalOpen(false);
    } catch (e: any) {
      setSubmitError(e.message || "Nepodarilo sa ulozit hodnotenie.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!targetUserId) return null;

  const displayRateButton = showRateButton && !isOwnProfile;
  const ratingRestrictionMessage = !currentUserId
    ? "Pre odoslanie hodnotenia sa prosim prihlas."
    : isOwnProfile
    ? "Svoj profil nie je mozne hodnotit."
    : "";
  const disableSubmit = Boolean(ratingRestrictionMessage || selectedRating < 1 || submitting);

  return (
    <div className={`${className} bg-white dark:bg-gray-800 shadow-md rounded-2xl p-6`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Hodnotenie</p>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold">
              {stats.count > 0 && typeof stats.average === "number" ? stats.average.toFixed(1) : "—"}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">/ 5 • {stats.count} hodnotení</span>
          </div>
          <div className="mt-1">
            <StarRow value={stats.average ?? 0} size="text-2xl" />
          </div>
        </div>
        {displayRateButton && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Ohodnotiť používateľa
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {!isOwnProfile && (
        <div className="mt-4">
          {myRating ? (
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 p-4">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-200">Moje hodnotenie</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                <StarRow value={myRating.rating ?? 0} size="text-xl" />
                <span>{myRating.rating}/5</span>
                <span className="text-xs text-gray-500">{formatRatingDate(myRating.created_at)}</span>
              </div>
              {myRating.comment && (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line">{myRating.comment}</p>
              )}
            </div>
          ) : displayRateButton ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {currentUserId ? "Zatiaľ ste tento profil nehodnotili." : "Prihláste sa, aby ste mohli pridať hodnotenie."}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-6">
        <h4 className="text-base font-semibold mb-3">Najnovšie hodnotenia</h4>
        {loading ? (
          <p className="text-sm text-gray-500">Načítavam hodnotenia…</p>
        ) : ratings.length === 0 ? (
          <p className="text-sm text-gray-500">Tento profil zatiaľ nemá hodnotenia.</p>
        ) : (
          <div className="space-y-3">
            {ratings.map((rating) => (
              <div
                key={rating.id_rating}
                className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4"
              >
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-semibold">{rating.rated_by_name || "Používateľ"}</span>
                  <span>{formatRatingDate(rating.created_at)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <StarRow value={rating.rating ?? 0} size="text-lg" />
                  <span className="text-xs text-gray-500">{rating.rating}/5</span>
                </div>
                {rating.comment && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line">{rating.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex flex-col items-center gap-3 text-sm text-gray-600 dark:text-gray-300 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 disabled:opacity-60"
            >
              Predošlá
            </button>
            <span>
              Strana {page} / {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
              disabled={page >= pages}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 disabled:opacity-60"
            >
              Ďalšia
            </button>
          </div>
        )}
      </div>

      {isModalOpen && displayRateButton && (
        <div
          className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4 py-6"
          onClick={handleCloseModal}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseModal}
              className="absolute top-3 right-3 text-2xl text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              disabled={submitting}
              aria-label="Zavrieť hodnotenie"
            >
              ×
            </button>
            <h4 className="text-xl font-semibold text-center">Ohodnotiť používateľa</h4>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 text-center">
              Vyber počet hviezdičiek a pridaj krátky komentár (voliteľné).
            </p>
            <div className="mt-4 flex justify-center gap-2" role="radiogroup" aria-label="Výber hodnotenia v hviezdach">
              {[1, 2, 3, 4, 5].map((value) => {
                const active = value <= selectedRating;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      if (ratingRestrictionMessage && !currentUserId) return;
                      setSelectedRating(value);
                    }}
                    className={`text-4xl transition transform ${
                      active ? "text-yellow-400" : "text-gray-300"
                    } ${ratingRestrictionMessage ? "cursor-not-allowed" : "hover:scale-110"}`}
                    aria-label={`Hodnotiť ${value} z 5`}
                    aria-pressed={active}
                  >
                    {"\u2605"}
                  </button>
                );
              })}
            </div>
            {ratingRestrictionMessage && (
              <p className="mt-3 text-sm text-yellow-600 dark:text-yellow-400 text-center">{ratingRestrictionMessage}</p>
            )}
            {submitError && <p className="mt-3 text-sm text-red-500 text-center">{submitError}</p>}
            <div className="mt-5">
              <label htmlFor="rating-comment" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Komentár
              </label>
              <textarea
                id="rating-comment"
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Napíšte krátku skúsenosť (voliteľné)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                disabled={submitting}
              />
              <div className="mt-1 text-right text-xs text-gray-500">{comment.length}/1000</div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-xl border border-gray-300 dark:border-gray-700 px-5 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                disabled={submitting}
              >
                Zavrieť
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disableSubmit}
              >
                {submitting ? "Ukladám..." : "Odoslať hodnotenie"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
