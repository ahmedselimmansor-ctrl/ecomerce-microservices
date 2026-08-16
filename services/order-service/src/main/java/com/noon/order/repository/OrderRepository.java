package com.noon.order.repository;

import com.noon.order.domain.Order;
import com.noon.order.domain.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    /** {@code EntityGraph} يجلب الأسطر في استعلام واحد — يمنع N+1. */
    @EntityGraph(attributePaths = "items")
    Optional<Order> findWithItemsById(UUID id);

    @EntityGraph(attributePaths = "items")
    Optional<Order> findWithItemsByIdAndUserId(UUID id, UUID userId);

    Optional<Order> findByOrderNumberAndUserId(String orderNumber, UUID userId);

    Page<Order> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    @Query("select o from Order o where o.status = :status and o.createdAt < :cutoff")
    List<Order> findStuckInStatus(@Param("status") OrderStatus status,
                                  @Param("cutoff") Instant cutoff,
                                  Pageable pageable);

    @Query(value = "SELECT nextval('order_number_seq')", nativeQuery = true)
    long nextOrderNumber();

    // ------------------------------------------------------------------ admin

    Page<Order> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<Order> findByStatusOrderByCreatedAtDesc(OrderStatus status, Pageable pageable);

    Page<Order> findByOrderNumberContainingIgnoreCaseOrderByCreatedAtDesc(String term,
                                                                          Pageable pageable);

    long countByStatus(OrderStatus status);

    /** إجمالي الإيراد: الطلبات المؤكدة فقط — الملغاة لا تُحتسب. */
    @Query("""
            select coalesce(sum(o.totalMinor), 0) from Order o
            where o.status in (com.noon.order.domain.OrderStatus.CONFIRMED,
                               com.noon.order.domain.OrderStatus.PROCESSING,
                               com.noon.order.domain.OrderStatus.SHIPPED,
                               com.noon.order.domain.OrderStatus.DELIVERED)
            """)
    long sumRevenueMinor();

    @Query("""
            select coalesce(sum(o.totalMinor), 0) from Order o
            where o.createdAt >= :since
              and o.status in (com.noon.order.domain.OrderStatus.CONFIRMED,
                               com.noon.order.domain.OrderStatus.PROCESSING,
                               com.noon.order.domain.OrderStatus.SHIPPED,
                               com.noon.order.domain.OrderStatus.DELIVERED)
            """)
    long sumRevenueMinorSince(@Param("since") Instant since);

    long countByCreatedAtGreaterThanEqual(Instant since);
}
